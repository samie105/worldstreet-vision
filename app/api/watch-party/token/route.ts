import { NextResponse } from "next/server"

import { getAuthUser } from "@/lib/auth/clerk"
import { connectDB } from "@/lib/db/mongodb"
import VisionWatchParty from "@/models/VisionWatchParty"
import { getAblyRest } from "@/lib/realtime/ably"
import { getDevWatchPartyChannelForUser } from "@/lib/watch-party/dev-in-memory"
import { normalizeInviteCode } from "@/lib/watch-party/invite-code"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { inviteCode?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  if (!body.inviteCode) {
    return NextResponse.json({ error: "Missing inviteCode" }, { status: 400 })
  }

  const code = normalizeInviteCode(body.inviteCode)

  let channel: string | null = null

  try {
    await connectDB()
    const session = await VisionWatchParty.findOne({ inviteCode: code })
    if (session) {
      const isParticipant = session.participants.some((p) => p.authUserId === user.userId)
      if (!isParticipant) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
      channel = session.channel
    }
  } catch {
    // offline / no Mongo — may still be a dev in-memory party
  }

  if (!channel) {
    channel = getDevWatchPartyChannelForUser(code, user.userId)
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

  return NextResponse.json({ tokenRequest, channel })
}
