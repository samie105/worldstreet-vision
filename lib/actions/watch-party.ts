"use server"

import crypto from "node:crypto"

import { headers } from "next/headers"

import { requireRealAuthUser } from "@/lib/auth/clerk"
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"
import { connectDB } from "@/lib/db/mongodb"
import VisionWatchParty, {
  type IVisionWatchPartyParticipant,
} from "@/models/VisionWatchParty"
import VisionTitle from "@/models/VisionTitle"
import VisionAsset from "@/models/VisionAsset"
import { getAblyRest, watchPartyChannelName } from "@/lib/realtime/ably"
import {
  getDevWatchParty,
  hasDevWatchParty,
  putDevWatchParty,
  type DevWatchPartyStoredState,
} from "@/lib/watch-party/dev-in-memory"
import { normalizeInviteCode } from "@/lib/watch-party/invite-code"
import { resolveVisionAppUrl } from "@/lib/site"

import type { WatchPartySnapshot } from "@/lib/watch-party/snapshot"

const isObjectId = (value: string) => /^[a-f0-9]{24}$/i.test(value)

/**
 * Origin the current request actually hit, from the proxy-forwarded headers.
 * Guarantees invite links point at the host the creator is using (custom
 * domain, preview deploy, LAN dev server) instead of a misconfigured
 * NEXT_PUBLIC_APP_URL. Falls back to resolveVisionAppUrl() outside request
 * scope or when no host header is present.
 */
async function resolveRequestOrigin(): Promise<string> {
  try {
    const headerStore = await headers()
    const host =
      headerStore.get("x-forwarded-host")?.trim() || headerStore.get("host")?.trim()
    if (host) {
      const forwardedProto = headerStore
        .get("x-forwarded-proto")
        ?.split(",")[0]
        ?.trim()
      const proto =
        forwardedProto ||
        (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https")
      return `${proto}://${host}`
    }
  } catch {
    // headers() is unavailable outside a request scope.
  }
  return resolveVisionAppUrl()
}

function buildDevSnapshot(
  state: DevWatchPartyStoredState,
  origin: string,
): WatchPartySnapshot {
  return {
    inviteCode: state.inviteCode,
    inviteUrl: buildInviteUrl(state.inviteCode, state.inviteToken, origin),
    channel: state.channel,
    hostId: state.hostId,
    titleId: state.titleId,
    assetId: state.assetId,
    status: state.status,
    participants: state.participants,
    playback: state.playback,
    expiresAt: state.expiresAt,
  }
}

export async function createWatchParty(input: {
  titleId: string
  assetId: string
  startPositionSeconds?: number
}): Promise<{ success: boolean; data?: WatchPartySnapshot; error?: string }> {
  try {
    const user = await requireRealAuthUser()
    const origin = await resolveRequestOrigin()
    const startPositionSeconds = Math.max(0, Math.floor(input.startPositionSeconds ?? 0))

    // Mock IDs ("demo-title-01") cannot be loaded from Mongo. When the dev
    // auth bypass is on we still want an end-to-end flow for testing, so we
    // synthesize an in-memory party.
    const usingMocks = !isObjectId(input.titleId) || !isObjectId(input.assetId)

    if (usingMocks && isDevAuthBypassEnabled()) {
      const inviteCode = generateInviteCode()
      const inviteToken = crypto.randomBytes(24).toString("hex")
      const channel = watchPartyChannelName(inviteCode)

      try {
        await connectDB()
        const session = await VisionWatchParty.create({
          inviteCode,
          inviteToken,
          hostId: user.userId,
          titleId: input.titleId,
          assetId: input.assetId,
          status: "lobby",
          participants: [
            {
              authUserId: user.userId,
              displayName:
                `${user.firstName} ${user.lastName}`.trim() || user.email || "Host",
              avatarUrl: user.imageUrl,
              isHost: true,
              joinedAt: new Date(),
            },
          ],
          playback: {
            isPlaying: false,
            positionSeconds: startPositionSeconds,
            updatedAt: new Date(),
            version: 0,
          },
          channel,
        })
        return { success: true, data: serialize(session, inviteToken, origin) }
      } catch (err) {
        console.warn("[vision/watch-party] Mongo unavailable for mock party; using in-memory", err)
        const state: DevWatchPartyStoredState = {
          inviteCode,
          inviteToken,
          hostId: user.userId,
          titleId: input.titleId,
          assetId: input.assetId,
          channel,
          status: "lobby",
          participants: [
            {
              authUserId: user.userId,
              displayName:
                `${user.firstName} ${user.lastName}`.trim() || user.email || "Host",
              avatarUrl: user.imageUrl,
              isHost: true,
              joinedAt: new Date().toISOString(),
            },
          ],
          playback: {
            isPlaying: false,
            positionSeconds: startPositionSeconds,
            updatedAt: new Date().toISOString(),
            version: 0,
          },
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
          updatedAt: new Date().toISOString(),
        }
        putDevWatchParty(state)
        return { success: true, data: buildDevSnapshot(state, origin) }
      }
    }

    await connectDB()

    const [title, asset] = await Promise.all([
      VisionTitle.findById(input.titleId),
      VisionAsset.findById(input.assetId),
    ])
    if (!title || !asset) return { success: false, error: "Missing title or asset" }
    if (asset.status !== "ready") return { success: false, error: "Asset not ready" }

    const inviteCode = generateInviteCode()
    const inviteToken = crypto.randomBytes(24).toString("hex")
    const channel = watchPartyChannelName(inviteCode)

    const session = await VisionWatchParty.create({
      inviteCode,
      inviteToken,
      hostId: user.userId,
      titleId: input.titleId,
      assetId: input.assetId,
      status: "lobby",
      participants: [
        {
          authUserId: user.userId,
          displayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
          avatarUrl: user.imageUrl,
          isHost: true,
          joinedAt: new Date(),
        },
      ],
      playback: {
        isPlaying: false,
        positionSeconds: startPositionSeconds,
        updatedAt: new Date(),
        version: 0,
      },
      channel,
    })

    return { success: true, data: serialize(session, inviteToken, origin) }
  } catch (error) {
    return errorResult(error)
  }
}

export async function joinWatchParty(
  inviteCode: string,
  token: string,
): Promise<{ success: boolean; data?: WatchPartySnapshot; error?: string }> {
  try {
    const user = await requireRealAuthUser()
    const origin = await resolveRequestOrigin()
    const code = normalizeInviteCode(inviteCode)

    try {
      await connectDB()
      const session = await VisionWatchParty.findOne({ inviteCode: code })
      if (session) {
        if (session.status === "ended") {
          return { success: false, error: "This watch party has ended." }
        }
        if (session.expiresAt.getTime() < Date.now()) {
          return { success: false, error: "Invite has expired" }
        }
        if (session.inviteToken !== token) {
          return { success: false, error: "Invalid invite" }
        }
        const alreadyJoined = session.participants.some((p) => p.authUserId === user.userId)
        if (!alreadyJoined) {
          session.participants.push({
            authUserId: user.userId,
            displayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            avatarUrl: user.imageUrl,
            isHost: false,
            joinedAt: new Date(),
          })
          await session.save()
        }
        return { success: true, data: serialize(session, token, origin) }
      }
    } catch {
      // Mongo unavailable — try in-memory below
    }

    if (isDevAuthBypassEnabled()) {
      const dev = getDevWatchParty(code)
      if (dev) {
        if (dev.status === "ended") {
          return { success: false, error: "This watch party has ended." }
        }
        if (new Date(dev.expiresAt).getTime() < Date.now()) {
          return { success: false, error: "Invite has expired" }
        }
        if (dev.inviteToken !== token) {
          return { success: false, error: "Invalid invite" }
        }
        const alreadyJoined = dev.participants.some((p) => p.authUserId === user.userId)
        if (!alreadyJoined) {
          dev.participants.push({
            authUserId: user.userId,
            displayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            avatarUrl: user.imageUrl,
            isHost: false,
            joinedAt: new Date().toISOString(),
          })
          dev.updatedAt = new Date().toISOString()
          putDevWatchParty(dev)
        }
        return { success: true, data: buildDevSnapshot(dev, origin) }
      }
    }

    return { success: false, error: "Watch party not found" }
  } catch (error) {
    return errorResult(error)
  }
}

export async function getWatchPartyForParticipant(
  inviteCode: string,
  /**
   * Optional invite token. When provided and the caller isn't yet a participant,
   * the call auto-joins them (mirrors the /invite/[code] flow). This lets a guest
   * deep-link to /watch/[assetId]?party=CODE&token=TOKEN without bouncing through
   * the invite landing page.
   */
  token?: string,
): Promise<{ success: boolean; data?: WatchPartySnapshot; error?: string }> {
  try {
    const user = await requireRealAuthUser()
    const origin = await resolveRequestOrigin()
    const code = normalizeInviteCode(inviteCode)

    try {
      await connectDB()
      const session = await VisionWatchParty.findOne({ inviteCode: code })
      if (session) {
        if (session.status === "ended") {
          return { success: false, error: "This watch party has ended." }
        }
        if (session.expiresAt.getTime() < Date.now()) {
          return { success: false, error: "Invite has expired" }
        }
        const isParticipant = session.participants.some((p) => p.authUserId === user.userId)
        if (!isParticipant) {
          if (!token || token !== session.inviteToken) {
            return { success: false, error: "You are not part of this watch party." }
          }
          session.participants.push({
            authUserId: user.userId,
            displayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            avatarUrl: user.imageUrl,
            isHost: false,
            joinedAt: new Date(),
          })
          await session.save()
        }
        return { success: true, data: serialize(session, session.inviteToken, origin) }
      }
    } catch {
      // continue to in-memory
    }

    if (isDevAuthBypassEnabled()) {
      const dev = getDevWatchParty(code)
      if (dev) {
        if (dev.status === "ended") {
          return { success: false, error: "This watch party has ended." }
        }
        if (new Date(dev.expiresAt).getTime() < Date.now()) {
          return { success: false, error: "Invite has expired" }
        }
        const isParticipant = dev.participants.some((p) => p.authUserId === user.userId)
        if (!isParticipant) {
          if (!token || token !== dev.inviteToken) {
            return { success: false, error: "You are not part of this watch party." }
          }
          dev.participants.push({
            authUserId: user.userId,
            displayName: `${user.firstName} ${user.lastName}`.trim() || user.email,
            avatarUrl: user.imageUrl,
            isHost: false,
            joinedAt: new Date().toISOString(),
          })
          dev.updatedAt = new Date().toISOString()
          putDevWatchParty(dev)
        }
        return { success: true, data: buildDevSnapshot(dev, origin) }
      }
    }

    return { success: false, error: "Watch party not found" }
  } catch (error) {
    return errorResult(error)
  }
}

export async function endWatchParty(
  inviteCode: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireRealAuthUser()
    const code = normalizeInviteCode(inviteCode)
    let channel: string | null = null

    try {
      await connectDB()
      const session = await VisionWatchParty.findOne({ inviteCode: code })
      if (session) {
        if (session.hostId !== user.userId) return { success: false, error: "Forbidden" }
        if (session.status !== "ended") {
          session.status = "ended"
          await session.save()
        }
        channel = session.channel
      }
    } catch {
      // try in-memory
    }

    if (!channel && hasDevWatchParty(code) && isDevAuthBypassEnabled()) {
      const dev = getDevWatchParty(code)!
      if (dev.hostId !== user.userId) return { success: false, error: "Forbidden" }
      dev.status = "ended"
      dev.updatedAt = new Date().toISOString()
      putDevWatchParty(dev)
      channel = dev.channel
    }

    if (!channel) return { success: false, error: "Not found" }

    // Notify everyone connected so guests don't sit on a dead session.
    try {
      await getAblyRest()
        .channels.get(channel)
        .publish("session", { status: "ended", endedAt: new Date().toISOString() })
    } catch (err) {
      console.warn("[vision/watch-party] failed to broadcast end", err)
    }

    return { success: true }
  } catch (error) {
    return errorResult(error)
  }
}

export async function recordPlaybackState(
  inviteCode: string,
  state: { isPlaying: boolean; positionSeconds: number },
): Promise<{ success: boolean }> {
  try {
    const user = await requireRealAuthUser()
    const code = normalizeInviteCode(inviteCode)

    try {
      await connectDB()
      const session = await VisionWatchParty.findOne({ inviteCode: code })
      if (session) {
        if (session.hostId !== user.userId) return { success: false }

        session.playback = {
          isPlaying: state.isPlaying,
          positionSeconds: Math.max(0, state.positionSeconds),
          updatedAt: new Date(),
          version: (session.playback?.version ?? 0) + 1,
        }
        if (session.status === "lobby") session.status = "active"
        await session.save()
        return { success: true }
      }
    } catch {
      // in-memory fallback
    }

    if (hasDevWatchParty(code) && isDevAuthBypassEnabled()) {
      const dev = getDevWatchParty(code)!
      if (dev.hostId !== user.userId) return { success: false }
      dev.playback = {
        isPlaying: state.isPlaying,
        positionSeconds: Math.max(0, state.positionSeconds),
        updatedAt: new Date().toISOString(),
        version: (dev.playback?.version ?? 0) + 1,
      }
      if (dev.status === "lobby") dev.status = "active"
      dev.updatedAt = new Date().toISOString()
      putDevWatchParty(dev)
      return { success: true }
    }

    return { success: false }
  } catch (error) {
    console.error("[vision/watch-party/state]", error)
    return { success: false }
  }
}

function serialize(
  doc: typeof VisionWatchParty.prototype,
  token: string,
  origin: string,
): WatchPartySnapshot {
  const inviteUrl = buildInviteUrl(doc.inviteCode, token, origin)
  return {
    inviteCode: doc.inviteCode,
    inviteUrl,
    channel: doc.channel,
    hostId: doc.hostId,
    titleId: doc.titleId,
    assetId: doc.assetId,
    status: doc.status,
    participants: doc.participants.map((p: IVisionWatchPartyParticipant) => ({
      authUserId: p.authUserId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      isHost: p.isHost,
      joinedAt: p.joinedAt.toISOString(),
    })),
    playback: {
      isPlaying: doc.playback.isPlaying,
      positionSeconds: doc.playback.positionSeconds,
      updatedAt: doc.playback.updatedAt.toISOString(),
      version: doc.playback.version,
    },
    expiresAt: doc.expiresAt.toISOString(),
  }
}

function buildInviteUrl(inviteCode: string, token: string, origin: string): string {
  const base = origin || resolveVisionAppUrl()
  return `${base.replace(/\/$/g, "")}/invite/${inviteCode}?token=${token}`
}

function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 8 })
    .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
    .join("")
}

function errorResult<T>(error: unknown): {
  success: boolean
  data?: T
  error?: string
} {
  if (error instanceof Error) {
    if (error.name === "UnauthorizedError") return { success: false, error: "Unauthorized" }
    console.error("[vision/watch-party]", error)
    return { success: false, error: error.message }
  }
  return { success: false, error: "Unknown error" }
}
