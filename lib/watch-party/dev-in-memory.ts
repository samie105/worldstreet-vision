import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"

import { normalizeInviteCode } from "./invite-code"
import type { WatchPartyListRow, WatchPartySnapshot } from "./snapshot"

export interface DevWatchPartyStoredState {
  inviteCode: string
  inviteToken: string
  hostId: string
  titleId: string
  assetId: string
  channel: string
  status: WatchPartySnapshot["status"]
  participants: WatchPartySnapshot["participants"]
  playback: WatchPartySnapshot["playback"]
  expiresAt: string
  updatedAt: string
}

const DEV_WATCH_PARTIES = new Map<string, DevWatchPartyStoredState>()

export function putDevWatchParty(state: DevWatchPartyStoredState): void {
  const normalized = normalizeInviteCode(state.inviteCode)
  DEV_WATCH_PARTIES.set(normalized, { ...state, inviteCode: normalized })
}

export function getDevWatchParty(code: string): DevWatchPartyStoredState | undefined {
  return DEV_WATCH_PARTIES.get(normalizeInviteCode(code))
}

export function hasDevWatchParty(code: string): boolean {
  return DEV_WATCH_PARTIES.has(normalizeInviteCode(code))
}

export function listDevWatchPartiesForUser(userId: string): WatchPartyListRow[] {
  if (!isDevAuthBypassEnabled()) return []
  const rows: WatchPartyListRow[] = []
  for (const state of DEV_WATCH_PARTIES.values()) {
    if (new Date(state.expiresAt).getTime() < Date.now()) continue
    if (state.status === "ended") continue
    const isMember =
      state.hostId === userId ||
      state.participants.some((p) => p.authUserId === userId)
    if (!isMember) continue
    rows.push({
      inviteCode: state.inviteCode,
      assetId: state.assetId,
      titleId: state.titleId,
      status: state.status,
      participants: state.participants,
      updatedAt: new Date(state.updatedAt),
    })
  }
  return rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}

/** Channel name for an in-memory dev party, if the user is a participant. */
export function getDevWatchPartyChannelForUser(inviteCode: string, userId: string): string | null {
  if (!isDevAuthBypassEnabled()) return null
  const state = DEV_WATCH_PARTIES.get(normalizeInviteCode(inviteCode))
  if (!state) return null
  if (state.status === "ended") return null
  if (new Date(state.expiresAt).getTime() < Date.now()) return null
  const allowed =
    state.hostId === userId ||
    state.participants.some((p) => p.authUserId === userId)
  return allowed ? state.channel : null
}
