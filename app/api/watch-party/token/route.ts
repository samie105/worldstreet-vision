import { NextResponse } from "next/server"

import { getRealAuthUser } from "@/lib/auth/clerk"
import { connectDB } from "@/lib/db/mongodb"
import VisionWatchParty from "@/models/VisionWatchParty"
import { getAblyRest } from "@/lib/realtime/ably"
import { getDevWatchParty, putDevWatchParty } from "@/lib/watch-party/dev-in-memory"
import { normalizeInviteCode } from "@/lib/watch-party/invite-code"

export const runtime = "nodejs"

/**
 * Mints an Ably token for a watch-party channel.
 *
 * Identity note: this MUST use `getRealAuthUser()` (direct Clerk), not
 * `getAuthUser()`. Parties are created/joined with real Clerk ids and the
 * client opens its Realtime connection with `clientId = <real Clerk id>`.
 * When the dev-auth bypass is on, `getAuthUser()` returns the shared
 * "dev-user-001" identity, which (a) fails the participant check with a 403
 * and (b) would mint a token whose clientId mismatches the connection's
 * clientId — Ably rejects that outright. Either way the party never connects.
 *
 * Capability note: every participant gets `publish`. Live chat, reactions and
 * presence all publish from every member's browser on this channel — a
 * subscribe-only guest token makes Ably NACK guests' chat messages (40160).
 * Playback stays host-authoritative in the clients: members apply `playback`
 * events only when the Ably-authenticated `message.clientId` equals the
 * party's hostId, so a guest publishing a forged playback event is ignored.
 */
export async function POST(req: Request) {
  const user = await getRealAuthUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { inviteCode?: string; token?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  if (!body.inviteCode) {
    return NextResponse.json({ error: "Missing inviteCode" }, { status: 400 })
  }

  const code = normalizeInviteCode(body.inviteCode)
  const inviteToken = typeof body.token === "string" && body.token.length > 0 ? body.token : null
  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email

  let channel: string | null = null
  let hostId: string | null = null

  try {
    await connectDB()
    const session = await VisionWatchParty.findOne({ inviteCode: code })
    if (session) {
      if (session.status === "ended") {
        return NextResponse.json({ error: "Gone" }, { status: 410 })
      }
      if (session.expiresAt.getTime() < Date.now()) {
        return NextResponse.json({ error: "Gone" }, { status: 410 })
      }
      const isParticipant = session.participants.some((p) => p.authUserId === user.userId)
      if (!isParticipant) {
        // A valid invite token is a join credential (same rule as the
        // /invite/[code] flow). This closes the race where a guest asks for a
        // token before their join write landed — instead of a dead 403 we
        // add them and mint.
        if (!inviteToken || inviteToken !== session.inviteToken) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        session.participants.push({
          authUserId: user.userId,
          displayName,
          avatarUrl: user.imageUrl,
          isHost: false,
          joinedAt: new Date(),
        })
        await session.save()
      }
      channel = session.channel
      hostId = session.hostId
    }
  } catch {
    // offline / no Mongo — may still be a dev in-memory party
  }

  if (!channel) {
    const dev = getDevWatchParty(code)
    if (dev) {
      if (dev.status === "ended" || new Date(dev.expiresAt).getTime() < Date.now()) {
        return NextResponse.json({ error: "Gone" }, { status: 410 })
      }
      const allowed =
        dev.hostId === user.userId || dev.participants.some((p) => p.authUserId === user.userId)
      if (!allowed) {
        if (!inviteToken || inviteToken !== dev.inviteToken) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 })
        }
        dev.participants.push({
          authUserId: user.userId,
          displayName,
          avatarUrl: user.imageUrl,
          isHost: false,
          joinedAt: new Date().toISOString(),
        })
        dev.updatedAt = new Date().toISOString()
        putDevWatchParty(dev)
      }
      channel = dev.channel
      hostId = dev.hostId
    }
  }

  if (!channel) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const ably = getAblyRest()
  const tokenRequest = await ably.auth.createTokenRequest({
    clientId: user.userId,
    capability: {
      [channel]: ["subscribe", "publish", "presence", "history"],
    },
    ttl: 30 * 60 * 1000,
  })

  return NextResponse.json({ tokenRequest, channel, hostId })
}
