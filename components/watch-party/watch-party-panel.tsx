"use client"

import * as React from "react"
import * as Ably from "ably"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import type { Message, RealtimeChannel, Realtime as RealtimeClient, TokenRequest } from "ably"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  UserMultipleIcon,
  PlayIcon,
  ArrowRight01Icon,
  SentIcon,
  Cancel01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage, AvatarGroup } from "@/components/ui/avatar"
import { useRealViewer } from "@/components/watch-party/use-real-viewer"
import {
  createWatchParty,
  recordPlaybackState,
  getWatchPartyForParticipant,
  endWatchParty,
} from "@/lib/actions/watch-party"
import type { WatchPartySnapshot } from "@/lib/watch-party/snapshot"
import type { CatalogAsset, CatalogTitle } from "@/lib/catalog/types"
import type { VisionProfileData } from "@/lib/actions/profile"
import type { AuthUser } from "@/components/auth-provider"
import { useProfile } from "@/components/profile-provider"

interface WatchPartyPanelProps {
  asset: CatalogAsset
  title: CatalogTitle | null
  initialMode: string | null
  /** Invite token preserved in the watch URL — lets a guest auto-join. */
  initialToken?: string | null
  playerRef: React.MutableRefObject<HTMLVideoElement | null>
  startedAt: number
  /** Fired when session is created, loaded, or cleared (e.g. after ending a party). */
  onSessionChange?: (session: WatchPartySnapshot | null) => void
  /** Fired when an Ably `session.status === "ended"` event is received. */
  onPartyEnded?: () => void
  /** Hides the docked panel (the Ably connection stays alive — the panel stays mounted). */
  onClose?: () => void
}

interface PlaybackMessage {
  type: "playback"
  isPlaying: boolean
  positionSeconds: number
  serverAt: number
  version: number
  fromHost: boolean
}

interface SessionMessage {
  status: "ended"
  endedAt?: string
}

/** Live chat message broadcast over the same Ably channel as playback events. */
interface CommentMessage {
  id: string
  text: string
  authorId: string
  authorName: string
  authorAvatar: string
  /** Author's video position when they posted, so others can see WHEN they reacted. */
  videoTimeSeconds: number
  /** Wall-clock send time (ISO). */
  sentAt: string
}

/** Chat rail entries: real messages plus inline system lines (joins/leaves). */
type ChatItem =
  | { kind: "comment"; message: CommentMessage }
  | { kind: "system"; id: string; text: string; sentAt: string }

type RealtimeStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "suspended"
  | "failed"

interface PresenceMember {
  authUserId: string
  displayName: string
  avatarUrl: string
  isHost: boolean
}

/** Clerk / dev default can point at our app mark; prefer initials instead. */
function isBrandedPlaceholderAvatarUrl(url: string): boolean {
  return url.trim().toLowerCase().includes("/worldstreet-logo/")
}

function buildPresenceMember(
  user: AuthUser,
  session: WatchPartySnapshot,
  profile: VisionProfileData | null,
): PresenceMember {
  const persistedName = profile?.displayName?.trim()
  const displayName =
    persistedName || `${user.firstName} ${user.lastName}`.trim() || user.email

  const persistedAvatar = profile?.avatarUrl?.trim() ?? ""
  let avatarUrl = persistedAvatar
  if (!avatarUrl) {
    const fromAuth = user.imageUrl?.trim() ?? ""
    if (fromAuth && !isBrandedPlaceholderAvatarUrl(fromAuth)) avatarUrl = fromAuth
  }

  return {
    authUserId: user.userId,
    displayName,
    avatarUrl,
    isHost: session.hostId === user.userId,
  }
}

function avatarSrcForMember(member: PresenceMember): string | undefined {
  const u = member.avatarUrl?.trim()
  if (!u || isBrandedPlaceholderAvatarUrl(u)) return undefined
  return u
}

/** Every participant snapshot embeds the invite token in its inviteUrl. */
function inviteTokenFromSession(session: WatchPartySnapshot | null): string | null {
  if (!session) return null
  try {
    return new URL(session.inviteUrl).searchParams.get("token")
  } catch {
    return null
  }
}

const DRIFT_TOLERANCE = 1.25
const MAX_CHAT_ITEMS = 250

function capChat(items: ChatItem[]): ChatItem[] {
  return items.length > MAX_CHAT_ITEMS ? items.slice(items.length - MAX_CHAT_ITEMS) : items
}

export function WatchPartyPanel({
  asset,
  title,
  initialMode,
  initialToken = null,
  playerRef,
  startedAt,
  onSessionChange,
  onPartyEnded,
  onClose,
}: WatchPartyPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Real Clerk identity (matches server-side requireRealAuthUser / token route).
  const user = useRealViewer()
  const { profile } = useProfile()
  const profileRef = React.useRef(profile)
  profileRef.current = profile
  const [session, setSession] = React.useState<WatchPartySnapshot | null>(null)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [hydrateError, setHydrateError] = React.useState<string | null>(null)
  const [endingParty, setEndingParty] = React.useState(false)
  const [endPartyOpen, setEndPartyOpen] = React.useState(false)
  const [members, setMembers] = React.useState<PresenceMember[]>([])
  const [realtimeStatus, setRealtimeStatus] = React.useState<RealtimeStatus>("idle")
  const [chatItems, setChatItems] = React.useState<ChatItem[]>([])
  const [draftComment, setDraftComment] = React.useState("")
  const [copiedInvite, setCopiedInvite] = React.useState(false)
  const [joinCodeInput, setJoinCodeInput] = React.useState("")
  const [joining, setJoining] = React.useState(false)
  const channelRef = React.useRef<RealtimeChannel | null>(null)
  const realtimeRef = React.useRef<RealtimeClient | null>(null)
  const onPartyEndedRef = React.useRef(onPartyEnded)
  onPartyEndedRef.current = onPartyEnded
  const isHost = !!session && !!user && session.hostId === user.userId

  // Latest-value refs so the (deliberately narrow-dep) connection effect and
  // long-lived Ably callbacks never read stale closures — and never force a
  // full reconnect just because an object identity changed.
  const sessionRef = React.useRef(session)
  sessionRef.current = session
  const userRef = React.useRef(user)
  userRef.current = user
  const isHostRef = React.useRef(isHost)
  isHostRef.current = isHost
  const initialTokenRef = React.useRef(initialToken)
  initialTokenRef.current = initialToken

  const lastBroadcastRef = React.useRef<number>(0)
  const lastDbPersistRef = React.useRef<number>(0)
  const broadcastVersionRef = React.useRef(0)
  const lastGuestVersionRef = React.useRef(0)
  const guestSyncedInviteRef = React.useRef<string | null>(null)
  /** Codes we saw end via Ably — stops the hydrate effect from re-fetching a dead party. */
  const endedCodesRef = React.useRef<Set<string>>(new Set())
  // `startedAt` can tick from the player. Capturing it in a ref means the
  // `startSession` callback can read the latest position without listing it as
  // a dependency — which previously caused the auto-start effect to refire
  // constantly and queue dozens of `createWatchParty` calls.
  const startedAtRef = React.useRef(startedAt)
  startedAtRef.current = startedAt
  // Single-flight gate for the auto-start (`?party=new`) effect.
  const autoStartFiredRef = React.useRef(false)

  /** Ably broadcasts for guest sync every few seconds; DB persists only when `persist` is true (play/pause/seek). */
  const publishHostPlayback = React.useCallback(
    (inviteCode: string, options?: { persist?: boolean }) => {
      const channel = channelRef.current
      const node = playerRef.current as HTMLVideoElement | null
      if (!channel || !node) return
      const now = Date.now()
      lastBroadcastRef.current = now
      const positionSeconds = Number(node.currentTime ?? 0)
      const isPlaying = !node.paused
      const version = ++broadcastVersionRef.current
      const message: PlaybackMessage = {
        type: "playback",
        isPlaying,
        positionSeconds,
        serverAt: now,
        version,
        fromHost: true,
      }
      void channel.publish("playback", message).catch(() => {})
      if (options?.persist) {
        lastDbPersistRef.current = Date.now()
        void recordPlaybackState(inviteCode, { isPlaying, positionSeconds })
      }
    },
    [playerRef],
  )

  const startSession = React.useCallback(async () => {
    if (!user) {
      setError("Sign in to start a watch party.")
      return
    }
    if (!title) {
      setError("This asset is not part of a title yet.")
      return
    }
    setPending(true)
    setError(null)
    try {
      const result = await createWatchParty({
        titleId: title._id,
        assetId: asset._id,
        // Seed the synced position with where the host is currently watching so
        // late joiners (and the server snapshot) don’t fall back to 0:00.
        startPositionSeconds: Math.max(0, Math.floor(startedAtRef.current)),
      })
      if (!result.success || !result.data) {
        throw new Error(result.error ?? "Failed to start party")
      }
      setSession(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed")
    } finally {
      setPending(false)
    }
  }, [asset._id, title, user])

  React.useEffect(() => {
    onSessionChange?.(session)
  }, [session, onSessionChange])

  React.useEffect(() => {
    if (!session) guestSyncedInviteRef.current = null
  }, [session])

  React.useEffect(() => {
    if (!initialMode || initialMode === "new" || session) return
    if (endedCodesRef.current.has(initialMode.toUpperCase())) return
    let cancelled = false
    setHydrateError(null)
    setPending(true)
    void getWatchPartyForParticipant(initialMode, initialToken ?? undefined).then((res) => {
      if (cancelled) return
      setPending(false)
      if (res.success && res.data) {
        setSession(res.data)
      } else {
        setHydrateError(res.error ?? "Could not open this watch party.")
      }
    })
    return () => {
      cancelled = true
    }
  }, [initialMode, initialToken, session])

  React.useEffect(() => {
    if (initialMode !== "new" || session) return
    if (autoStartFiredRef.current) return
    autoStartFiredRef.current = true
    void startSession()
  }, [initialMode, session, startSession])

  /** One-time align for guests from the server snapshot (Ably may trail). */
  React.useEffect(() => {
    if (!session || !user || session.hostId === user.userId) return
    if (guestSyncedInviteRef.current === session.inviteCode) return
    guestSyncedInviteRef.current = session.inviteCode
    lastGuestVersionRef.current = session.playback.version
    const node = playerRef.current as HTMLVideoElement | null
    if (!node) return
    try {
      node.currentTime = session.playback.positionSeconds
      if (session.playback.isPlaying) void node.play().catch(() => {})
      else node.pause()
    } catch {
      // ignore
    }
  }, [session, user, playerRef])

  React.useEffect(() => {
    if (!session || !user || session.hostId !== user.userId) return
    broadcastVersionRef.current = Math.max(broadcastVersionRef.current, session.playback.version)
  }, [session, user])

  /**
   * The realtime connection. Deps are the two PRIMITIVES that define a room
   * membership (invite code + viewer id) — object identities intentionally
   * stay out so a re-render can never silently tear down and re-dial Ably.
   */
  const sessionInviteCode = session?.inviteCode ?? null
  const viewerUserId = user?.userId ?? null
  React.useEffect(() => {
    const sess = sessionRef.current
    const usr = userRef.current
    if (!sess || !usr || !sessionInviteCode || !viewerUserId) return
    setRealtimeStatus("connecting")
    const realtime = new Ably.Realtime({
      authCallback: async (_params, callback) => {
        try {
          // The invite token doubles as a join credential: if this viewer's
          // participant row hasn't landed yet the route joins them instead of
          // returning a dead 403.
          const latest = sessionRef.current
          const token = inviteTokenFromSession(latest) ?? initialTokenRef.current ?? undefined
          const response = await fetch("/api/watch-party/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inviteCode: sessionInviteCode, token }),
          })
          if (!response.ok) throw new Error(`Failed to mint token (${response.status})`)
          const data = (await response.json()) as { tokenRequest: TokenRequest }
          callback(null, data.tokenRequest)
        } catch (err) {
          callback(err instanceof Error ? err.message : "Failed to mint token", null)
        }
      },
      clientId: viewerUserId,
    })
    realtimeRef.current = realtime

    // Surface connection state in the UI so silent disconnects are visible.
    const onConnectionStateChange = (change: Ably.ConnectionStateChange) => {
      const state = change.current as RealtimeStatus
      setRealtimeStatus(state)
    }
    realtime.connection.on(onConnectionStateChange)

    const channel = realtime.channels.get(sess.channel)
    channelRef.current = channel

    const onMessage = (message: Message) => {
      if (message.name !== "playback") return
      const data = message.data as PlaybackMessage
      if (!data || typeof data.version !== "number") return

      // Host-authoritative sync: Ably stamps the publisher's authenticated
      // clientId on every message (it comes from the minted token, so it
      // cannot be spoofed). Only the party host's playback events count —
      // everyone else's are dropped even though their token can publish
      // (publish is needed for chat).
      const hostId = sessionRef.current?.hostId
      if (!hostId || message.clientId !== hostId) return

      const node = playerRef.current as HTMLVideoElement | null
      if (!node || isHostRef.current) return
      if (data.version <= lastGuestVersionRef.current) return
      lastGuestVersionRef.current = data.version

      // Latency compensation: estimate where the host is RIGHT NOW based on the
      // wall-clock delta since they sent the message. Avoids a constant trail
      // when the host is playing forward.
      const ageSeconds = Math.max(0, (Date.now() - data.serverAt) / 1000)
      const targetPosition = data.isPlaying
        ? data.positionSeconds + ageSeconds
        : data.positionSeconds
      const drift = Math.abs(Number(node.currentTime ?? 0) - targetPosition)

      // Single seek path — only correct when drift is meaningful enough to
      // justify the audible jump. Below DRIFT_TOLERANCE we let natural playback
      // close the gap on its own.
      if (drift > DRIFT_TOLERANCE) {
        try {
          node.currentTime = targetPosition
        } catch {
          // ignore
        }
      }

      if (data.isPlaying && node.paused) {
        void node.play().catch(() => {})
      } else if (!data.isPlaying && !node.paused) {
        node.pause()
      }
    }

    /**
     * Server broadcasts `{ status: "ended" }` when the host ends the party.
     * Tear down playback sync and let the parent show a banner so guests
     * aren’t left wondering why the connection went quiet.
     */
    const onSessionMessage = (message: Message) => {
      const data = message.data as SessionMessage | undefined
      if (!data || data.status !== "ended") return
      const code = sessionRef.current?.inviteCode
      if (code) endedCodesRef.current.add(code.toUpperCase())
      const node = playerRef.current as HTMLVideoElement | null
      if (node && !node.paused) node.pause()
      setSession(null)
      onPartyEndedRef.current?.()
    }

    /** Append incoming chat messages, dedupe by id (covers our optimistic local add). */
    const onCommentMessage = (message: Message) => {
      const data = message.data as CommentMessage | undefined
      if (!data || typeof data.text !== "string") return
      setChatItems((prev) => {
        if (prev.some((item) => item.kind === "comment" && item.message.id === data.id)) return prev
        return capChat([...prev, { kind: "comment", message: data }])
      })
    }

    channel.subscribe("playback", onMessage)
    channel.subscribe("session", onSessionMessage)
    channel.subscribe("comment", onCommentMessage)

    // Pull the last 50 chat messages so late joiners see prior conversation.
    void channel
      .history({ limit: 50 })
      .then((page) => {
        const recent: ChatItem[] = []
        for (const msg of page.items) {
          if (msg.name !== "comment") continue
          const data = msg.data as CommentMessage | undefined
          if (data && typeof data.text === "string") recent.push({ kind: "comment", message: data })
        }
        // history() returns newest-first; flip to chronological order.
        recent.reverse()
        if (recent.length > 0) {
          setChatItems((prev) => {
            const seen = new Set(
              prev.filter((i) => i.kind === "comment").map((i) => (i as { message: CommentMessage }).message.id),
            )
            const merged = [
              ...recent.filter((i) => i.kind === "comment" && !seen.has(i.message.id)),
              ...prev,
            ]
            return capChat(merged)
          })
        }
      })
      .catch(() => {
        // history may be disabled for the channel — silently degrade.
      })

    void channel.presence
      .enter(buildPresenceMember(usr, sess, profileRef.current))
      .catch(() => {})

    const refreshPresence = async () => {
      try {
        const list = await channel.presence.get()
        // The same person can hold presence from two tabs/devices — collapse
        // by authUserId so the roster (and React keys) stay unique.
        const byUser = new Map<string, PresenceMember>()
        for (const member of list) {
          const data = member.data as PresenceMember | undefined
          if (!data?.authUserId) continue
          byUser.set(data.authUserId, data)
        }
        setMembers([...byUser.values()])
      } catch {
        // channel may be detaching during teardown
      }
    }
    void refreshPresence()

    /** Presence → members list + inline join/leave system lines in the chat. */
    const pushSystemLine = (text: string) => {
      setChatItems((prev) =>
        capChat([
          ...prev,
          {
            kind: "system",
            id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            text,
            sentAt: new Date().toISOString(),
          },
        ]),
      )
    }
    const nameOf = (pm: Ably.PresenceMessage): string => {
      const data = pm.data as PresenceMember | undefined
      return data?.displayName?.trim() || "Someone"
    }
    const onPresenceEnter = (pm: Ably.PresenceMessage) => {
      void refreshPresence()
      if (pm.clientId && pm.clientId !== viewerUserId) {
        pushSystemLine(`${nameOf(pm)} joined the party`)
      }
    }
    const onPresenceLeave = (pm: Ably.PresenceMessage) => {
      void refreshPresence()
      if (pm.clientId && pm.clientId !== viewerUserId) {
        pushSystemLine(`${nameOf(pm)} left`)
      }
    }
    const onPresenceUpdate = () => void refreshPresence()
    channel.presence.subscribe("enter", onPresenceEnter)
    channel.presence.subscribe("leave", onPresenceLeave)
    channel.presence.subscribe("update", onPresenceUpdate)

    return () => {
      channel.unsubscribe()
      channel.presence.unsubscribe()
      void channel.presence.leave().catch(() => {})
      realtime.connection.off(onConnectionStateChange)
      realtime.close()
      channelRef.current = null
      realtimeRef.current = null
      setRealtimeStatus("idle")
      setMembers([])
    }
  }, [sessionInviteCode, viewerUserId, playerRef])

  React.useEffect(() => {
    const channel = channelRef.current
    if (!channel || !session || !user || !profile) return
    void channel.presence.update(buildPresenceMember(user, session, profile)).catch(() => {})
  }, [profile?._id, profile?.avatarUrl, profile?.displayName, session?.inviteCode, user?.userId])

  React.useEffect(() => {
    if (!session || !isHost) return
    const video = playerRef.current as HTMLVideoElement | null
    if (!video) return

    const onSeeked = () => publishHostPlayback(session.inviteCode, { persist: true })
    const onPlay = () => publishHostPlayback(session.inviteCode, { persist: true })
    const onPause = () => publishHostPlayback(session.inviteCode, { persist: true })

    video.addEventListener("seeked", onSeeked)
    video.addEventListener("play", onPlay)
    video.addEventListener("pause", onPause)

    return () => {
      video.removeEventListener("seeked", onSeeked)
      video.removeEventListener("play", onPlay)
      video.removeEventListener("pause", onPause)
    }
  }, [session, isHost, playerRef, publishHostPlayback])

  React.useEffect(() => {
    if (!session || !isHost) return
    // Heartbeat every 3s so guests stay locked even if the host doesn't trigger
    // play/pause/seek. Keep the persist (Mongo write) cadence at ~28s so we
    // don't hammer the DB.
    const interval = window.setInterval(() => {
      const now = Date.now()
      if (now - lastBroadcastRef.current < 1_500) return
      const persist = now - lastDbPersistRef.current >= 28_000
      publishHostPlayback(session.inviteCode, persist ? { persist: true } : undefined)
    }, 3_000)
    return () => window.clearInterval(interval)
  }, [session, isHost, publishHostPlayback])

  /** Clear chat state when the active session changes. */
  React.useEffect(() => {
    setChatItems([])
    setDraftComment("")
  }, [session?.inviteCode])

  /** Publish a chat message: optimistic local insert + Ably broadcast. */
  const sendComment = React.useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !session || !user) return
      const channel = channelRef.current
      if (!channel) return
      const node = playerRef.current as HTMLVideoElement | null
      const persistedName = profile?.displayName?.trim()
      const displayName =
        persistedName || `${user.firstName} ${user.lastName}`.trim() || user.email
      const persistedAvatar = profile?.avatarUrl?.trim() ?? ""
      let avatarUrl = persistedAvatar
      if (!avatarUrl) {
        const fromAuth = user.imageUrl?.trim() ?? ""
        if (fromAuth && !isBrandedPlaceholderAvatarUrl(fromAuth)) avatarUrl = fromAuth
      }
      const message: CommentMessage = {
        id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed.slice(0, 500),
        authorId: user.userId,
        authorName: displayName,
        authorAvatar: avatarUrl,
        videoTimeSeconds: Math.max(0, Math.floor(Number(node?.currentTime ?? 0))),
        sentAt: new Date().toISOString(),
      }
      // Optimistic local insert so the sender sees their message immediately.
      setChatItems((prev) => capChat([...prev, { kind: "comment", message }]))
      setDraftComment("")
      void channel.publish("comment", message).catch(() => {
        // Publish was rejected (capability / connection). Remove the optimistic
        // copy so the sender isn't fooled into thinking anyone saw it.
        setChatItems((prev) =>
          prev.filter((item) => !(item.kind === "comment" && item.message.id === message.id)),
        )
        setError("Message didn’t send — check your connection and try again.")
      })
    },
    [session, user, profile, playerRef],
  )

  /** Resolve an invite code typed by a guest into an active session. */
  const joinByCode = React.useCallback(async () => {
    const code = joinCodeInput.trim().toUpperCase()
    if (!code) return
    setJoining(true)
    setError(null)
    try {
      const res = await getWatchPartyForParticipant(code)
      if (!res.success || !res.data) {
        // Common case: user has the code but never opened the invite link, so
        // they're not in the participants list yet. Direct them there.
        throw new Error(
          res.error === "You're not part of this watch party"
            ? "Ask the host to share the full invite link — the code alone isn’t enough to join."
            : res.error ?? "Could not join that party.",
        )
      }
      setSession(res.data)
      setJoinCodeInput("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join")
    } finally {
      setJoining(false)
    }
  }, [joinCodeInput])

  const runEndParty = React.useCallback(async () => {
    if (!session) return
    setEndingParty(true)
    setError(null)
    try {
      const res = await endWatchParty(session.inviteCode)
      if (!res.success) throw new Error(res.error ?? "Failed to end party")
      endedCodesRef.current.add(session.inviteCode.toUpperCase())
      setSession(null)
      setEndPartyOpen(false)
      const params = new URLSearchParams(searchParams.toString())
      params.delete("party")
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end party")
    } finally {
      setEndingParty(false)
    }
  }, [session, searchParams, pathname, router])

  const copyInvite = React.useCallback(() => {
    if (!session) return
    void navigator.clipboard.writeText(session.inviteUrl).then(() => {
      setCopiedInvite(true)
      window.setTimeout(() => setCopiedInvite(false), 1_600)
    })
  }, [session])

  const header = (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} className="size-4 text-primary" />
        <p className="truncate text-sm font-semibold tracking-tight">Watch Together</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {session ? <ConnectionPill status={realtimeStatus} /> : null}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-vision-stage-foreground"
            aria-label="Hide watch party panel"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  )

  if (!session) {
    if (hydrateError && initialMode && initialMode !== "new") {
      return (
        <div className="flex h-full min-h-0 flex-col text-sm text-vision-stage-foreground">
          {header}
          <div className="flex flex-col gap-3 p-4">
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {hydrateError}
            </p>
            <p className="text-xs text-muted-foreground">
              Open your invite link (with token) if you haven&apos;t joined yet, or ask the host to
              send a fresh link from Watch Together.
            </p>
          </div>
        </div>
      )
    }
    if (pending && initialMode && initialMode !== "new") {
      return (
        <div className="flex h-full min-h-0 flex-col text-sm">
          {header}
          <div className="flex flex-1 items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-warning" />
            Connecting to the watch party…
          </div>
        </div>
      )
    }

    return (
      <div className="flex h-full min-h-0 flex-col text-sm text-vision-stage-foreground">
        {header}
        <div className="flex flex-col gap-4 overflow-y-auto p-4">
          {!user ? (
            <p className="rounded-md border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
              Sign in to host or join a watch party.
            </p>
          ) : null}
          <p>
            Watch this together with friends — synced playback, live chat, and everyone who&apos;s in
            the room. The host controls play, pause, and seek.
          </p>
          <Button
            onClick={() => void startSession()}
            disabled={pending || !user}
            size="lg"
            className="rounded-full"
          >
            <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2.5} className="size-4" />
            {pending ? "Starting…" : "Start a watch party"}
          </Button>

          {/* Secondary path — a guest who already has the code (e.g. via DM)
              can drop it here instead of opening the full invite link. */}
          {user ? (
            <div className="rounded-xl border border-border/30 bg-black/20 p-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Already invited?
              </p>
              <form
                className="mt-2 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void joinByCode()
                }}
              >
                <Input
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase().slice(0, 8))}
                  placeholder="Party code"
                  className="h-9 flex-1 font-mono uppercase tracking-widest"
                  aria-label="Watch party code"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={joining || joinCodeInput.trim().length === 0}
                  className="rounded-full"
                >
                  {joining ? "Joining…" : "Join"}
                  {!joining ? (
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
                  ) : null}
                </Button>
              </form>
              <p className="mt-2 text-[11px] text-muted-foreground">
                The host’s link includes a token that adds you to the session. Joining by code
                alone only works after you’ve already opened that link once.
              </p>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Resume point ≈ {Math.floor(startedAt)}s when you start. Guests sync to the host as soon
            as they connect.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-sm">
      <Dialog open={endPartyOpen} onOpenChange={setEndPartyOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>End watch party?</DialogTitle>
            <DialogDescription>
              Everyone in this session will stop syncing together. Guests keep watching this title
              on their own.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEndPartyOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={endingParty}
              onClick={() => void runEndParty()}
            >
              {endingParty ? "Ending…" : "End for everyone"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {header}

      {/* Who's here — Ably presence, always visible above the chat. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {members.length > 0 ? (
            <AvatarGroup>
              {members.slice(0, 5).map((member) => (
                <Avatar key={member.authUserId} size="sm" title={member.displayName}>
                  <AvatarImage src={avatarSrcForMember(member)} alt="" />
                  <AvatarFallback>{member.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
          ) : null}
          <p className="truncate text-xs text-muted-foreground" aria-live="polite">
            {members.length === 0
              ? "Waiting for friends to join…"
              : summarizeMembers(members, user?.userId ?? null)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-vision-stage-foreground/80">
          {members.length} here
        </span>
      </div>

      {/* Invite — compact row; the full link goes to the clipboard. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Invite</p>
          <p className="truncate font-mono text-xs text-vision-stage-foreground/90">
            {session.inviteCode}
            <span className="ml-2 font-sans text-[10px] text-muted-foreground">
              expires{" "}
              {new Date(session.expiresAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </p>
        </div>
        <Button
          variant="glass"
          size="sm"
          className="shrink-0 rounded-full"
          onClick={copyInvite}
          aria-label="Copy invite link"
        >
          <HugeiconsIcon
            icon={copiedInvite ? Tick02Icon : Copy01Icon}
            strokeWidth={2}
            className="size-3.5"
          />
          {copiedInvite ? "Copied" : "Copy link"}
        </Button>
      </div>

      {/* Live chat fills the rail. */}
      <ChatPane
        items={chatItems}
        draft={draftComment}
        onDraftChange={setDraftComment}
        onSend={() => sendComment(draftComment)}
        currentUserId={user?.userId ?? null}
        connected={realtimeStatus === "connected"}
      />

      <div className="shrink-0 border-t border-white/10 px-4 py-3">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <HugeiconsIcon icon={PlayIcon} strokeWidth={2} className="size-3.5 text-primary" />
          {isHost
            ? "You’re hosting — play, pause, and seek sync to everyone."
            : "Following the host — playback stays in sync automatically."}
        </p>

        {isHost ? (
          <Button
            variant="destructive"
            size="sm"
            className="mt-2.5 w-full rounded-full"
            disabled={endingParty}
            onClick={() => setEndPartyOpen(true)}
          >
            End party for everyone
          </Button>
        ) : null}

        {error ? (
          <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** "You, Ada + 2 more" style presence summary. */
function summarizeMembers(members: PresenceMember[], currentUserId: string | null): string {
  const names = members.map((m) =>
    m.authUserId === currentUserId ? "You" : m.displayName.split(" ")[0] || m.displayName,
  )
  // Put "You" first when present.
  names.sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : 0))
  if (names.length <= 3) return names.join(", ")
  return `${names.slice(0, 3).join(", ")} + ${names.length - 3} more`
}

function ConnectionPill({ status }: { status: RealtimeStatus }) {
  const config: Record<RealtimeStatus, { label: string; dot: string; text: string }> = {
    idle: { label: "Idle", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
    connecting: { label: "Connecting", dot: "bg-warning animate-pulse", text: "text-warning" },
    connected: { label: "Live", dot: "bg-success", text: "text-success" },
    disconnected: { label: "Reconnecting", dot: "bg-warning animate-pulse", text: "text-warning" },
    suspended: { label: "Offline", dot: "bg-orange-400", text: "text-orange-200" },
    failed: { label: "Disconnected", dot: "bg-destructive", text: "text-destructive" },
  }
  // Ably can surface transitional states we don't chart (closing/closed) —
  // fall back instead of crashing the rail.
  const view = config[status] ?? config.connecting
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        view.text,
      )}
      aria-live="polite"
    >
      <span className={cn("inline-block size-1.5 rounded-full", view.dot)} />
      {view.label}
    </span>
  )
}

function formatVideoTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

interface ChatPaneProps {
  items: ChatItem[]
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  currentUserId: string | null
  connected: boolean
}

function ChatPane({ items, draft, onDraftChange, onSend, currentUserId, connected }: ChatPaneProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  // Auto-scroll to the newest message whenever the list grows.
  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [items.length])

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSend()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="scrollbar-none flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.length === 0 ? (
          <p className="m-auto max-w-52 text-center text-xs text-muted-foreground">
            No messages yet. Drop a reaction as you watch — everyone in the party sees it in real
            time.
          </p>
        ) : (
          items.map((item) => {
            if (item.kind === "system") {
              return (
                <p
                  key={item.id}
                  className="my-0.5 text-center text-[10px] uppercase tracking-wider text-muted-foreground/80"
                >
                  {item.text}
                </p>
              )
            }
            const c = item.message
            const mine = c.authorId === currentUserId
            return (
              <div
                key={c.id}
                className={cn("flex w-full gap-2", mine ? "flex-row-reverse text-right" : "flex-row")}
              >
                <Avatar size="sm">
                  <AvatarImage src={c.authorAvatar || undefined} alt="" />
                  <AvatarFallback>{c.authorName.slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className={cn("flex min-w-0 max-w-[80%] flex-col gap-0.5", mine && "items-end")}>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="truncate font-medium text-vision-stage-foreground/85">
                      {mine ? "You" : c.authorName}
                    </span>
                    <span
                      className="font-mono"
                      title={new Date(c.sentAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    >
                      {formatVideoTime(c.videoTimeSeconds)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "rounded-2xl px-3 py-1.5 text-xs leading-snug",
                      mine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-white/10 text-vision-stage-foreground",
                    )}
                  >
                    {c.text}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      <form className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4 py-2.5" onSubmit={onSubmit}>
        <Input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={connected ? "Say something…" : "Connecting…"}
          className="h-9 flex-1"
          maxLength={500}
          aria-label="Live chat message"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={draft.trim().length === 0}
          aria-label="Send"
        >
          <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
        </Button>
      </form>
    </div>
  )
}
