"use client"

import * as React from "react"
import * as Ably from "ably"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import type { Message, RealtimeChannel, Realtime as RealtimeClient, TokenRequest } from "ably"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, UserMultipleIcon, PlayIcon, ArrowRight01Icon, SentIcon } from "@hugeicons/core-free-icons"

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
import { useAuth } from "@/components/auth-provider"
// Watch parties always need a *real* Clerk identity \u2014 the shared dev-auth user
// would make every browser tab look like the same person and turn every guest
// into the host. Pull straight from Clerk so each tab gets its own userId.
import { useUser } from "@clerk/nextjs"
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

const DRIFT_TOLERANCE = 1.25

export function WatchPartyPanel({
  asset,
  title,
  initialMode,
  initialToken = null,
  playerRef,
  startedAt,
  onSessionChange,
  onPartyEnded,
}: WatchPartyPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user: fallbackUser } = useAuth()
  // Prefer the real Clerk session for identity; fall back to the in-app
  // AuthProvider only when Clerk isn\u2019t configured (covers local dev without
  // Clerk keys). The Clerk hook returns the *signed-in* user even when the
  // dev-auth bypass is active for the rest of the app.
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useUser()
  const user: AuthUser | null = React.useMemo(() => {
    if (clerkLoaded && clerkSignedIn && clerkUser) {
      return {
        userId: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
        firstName: clerkUser.firstName ?? "",
        lastName: clerkUser.lastName ?? "",
        imageUrl: clerkUser.imageUrl ?? "",
        isLoaded: true,
      }
    }
    return fallbackUser
  }, [clerkLoaded, clerkSignedIn, clerkUser, fallbackUser])
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
  const [comments, setComments] = React.useState<CommentMessage[]>([])
  const [draftComment, setDraftComment] = React.useState("")
  const [activeTab, setActiveTab] = React.useState<"people" | "chat">("chat")
  const [joinCodeInput, setJoinCodeInput] = React.useState("")
  const [joining, setJoining] = React.useState(false)
  const channelRef = React.useRef<RealtimeChannel | null>(null)
  const realtimeRef = React.useRef<RealtimeClient | null>(null)
  const onPartyEndedRef = React.useRef(onPartyEnded)
  onPartyEndedRef.current = onPartyEnded
  const isHost = !!session && !!user && session.hostId === user.userId
  const lastBroadcastRef = React.useRef<number>(0)
  const lastDbPersistRef = React.useRef<number>(0)
  const broadcastVersionRef = React.useRef(0)
  const lastGuestVersionRef = React.useRef(0)
  const guestSyncedInviteRef = React.useRef<string | null>(null)
  // `startedAt` ticks ~4x/second from the player. Capturing it in a ref means
  // the `startSession` callback can read the latest position without listing
  // it as a dependency — which previously caused the auto-start effect to
  // refire constantly and queue dozens of `createWatchParty` calls.
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
      void channel.publish("playback", message)
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

  React.useEffect(() => {
    if (!session || !user) return
    setRealtimeStatus("connecting")
    const realtime = new Ably.Realtime({
      authCallback: async (_params, callback) => {
        try {
          const response = await fetch("/api/watch-party/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inviteCode: session.inviteCode }),
          })
          if (!response.ok) throw new Error("Failed to mint token")
          const data = (await response.json()) as { tokenRequest: TokenRequest }
          callback(null, data.tokenRequest)
        } catch (err) {
          callback(err instanceof Error ? err.message : "Failed to mint token", null)
        }
      },
      clientId: user.userId,
    })
    realtimeRef.current = realtime

    // Surface connection state in the UI so silent disconnects are visible.
    const onConnectionStateChange = (change: Ably.ConnectionStateChange) => {
      const state = change.current as RealtimeStatus
      setRealtimeStatus(state)
    }
    realtime.connection.on(onConnectionStateChange)

    const channel = realtime.channels.get(session.channel)
    channelRef.current = channel

    const onMessage = (message: Message) => {
      if (message.name !== "playback") return
      const data = message.data as PlaybackMessage
      if (!data || typeof data.version !== "number") return

      const node = playerRef.current as HTMLVideoElement | null
      if (!node || isHost) return
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

      // Single seek path \u2014 only correct when drift is meaningful enough to
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
     * aren\u2019t left wondering why the connection went quiet.
     */
    const onSessionMessage = (message: Message) => {
      const data = message.data as SessionMessage | undefined
      if (!data || data.status !== "ended") return
      const node = playerRef.current as HTMLVideoElement | null
      if (node && !node.paused) node.pause()
      setSession(null)
      onPartyEndedRef.current?.()
    }

    /** Append incoming chat messages, dedupe by id (covers our optimistic local add). */
    const onCommentMessage = (message: Message) => {
      const data = message.data as CommentMessage | undefined
      if (!data || typeof data.text !== "string") return
      setComments((prev) => {
        if (prev.some((c) => c.id === data.id)) return prev
        const next = [...prev, data]
        // Cap at 200 in memory so long sessions don't bloat re-renders.
        return next.length > 200 ? next.slice(next.length - 200) : next
      })
    }

    channel.subscribe("playback", onMessage)
    channel.subscribe("session", onSessionMessage)
    channel.subscribe("comment", onCommentMessage)

    // Pull the last 50 chat messages so late joiners see prior conversation.
    void channel
      .history({ limit: 50 })
      .then((page) => {
        const recent: CommentMessage[] = []
        for (const msg of page.items) {
          if (msg.name !== "comment") continue
          const data = msg.data as CommentMessage | undefined
          if (data && typeof data.text === "string") recent.push(data)
        }
        // history() returns newest-first; flip to chronological order.
        recent.reverse()
        if (recent.length > 0) {
          setComments((prev) => {
            const seen = new Set(prev.map((c) => c.id))
            const merged = [...recent.filter((c) => !seen.has(c.id)), ...prev]
            return merged.length > 200 ? merged.slice(merged.length - 200) : merged
          })
        }
      })
      .catch(() => {
        // history may be disabled for the channel \u2014 silently degrade.
      })

    void channel.presence.enter(
      buildPresenceMember(user, session, profileRef.current),
    )

    const refreshPresence = async () => {
      const list = await channel.presence.get()
      setMembers(list.map((member) => member.data as PresenceMember))
    }
    void refreshPresence()
    channel.presence.subscribe(["enter", "leave", "update"], refreshPresence)

    return () => {
      channel.unsubscribe()
      void channel.presence.leave().catch(() => {})
      realtime.connection.off(onConnectionStateChange)
      realtime.close()
      channelRef.current = null
      realtimeRef.current = null
      setRealtimeStatus("idle")
    }
  }, [session, user, isHost, playerRef])

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
    setComments([])
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
      setComments((prev) => {
        const next = [...prev, message]
        return next.length > 200 ? next.slice(next.length - 200) : next
      })
      void channel.publish("comment", message)
      setDraftComment("")
    },
    [session, user, profile, playerRef],
  )

  /** Resolve a 6-character invite code typed by a guest into an active session. */
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
            ? "Ask the host to share the full invite link \u2014 the code alone isn\u2019t enough to join."
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

  if (!session) {
    if (hydrateError && initialMode && initialMode !== "new") {
      return (
        <div className="flex flex-col gap-3 p-4 text-sm text-vision-stage-foreground">
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {hydrateError}
          </p>
          <p className="text-xs text-muted-foreground">
            Open your invite link (with token) if you haven&apos;t joined yet, or ask the host to
            send a fresh link from Watch Together.
          </p>
        </div>
      )
    }
    if (pending && initialMode && initialMode !== "new") {
      return (
        <div className="p-4 text-sm text-muted-foreground">Connecting to the watch party…</div>
      )
    }

    return (
      <div className="flex flex-col gap-4 p-4 text-sm text-vision-stage-foreground">
        {!user ? (
          <p className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Sign in to host or join a watch party.
          </p>
        ) : null}
        <p>
          Watch this together with friends. The host controls play, pause, and seek; everyone else
          stays in sync over the network.
        </p>
        <Button onClick={() => void startSession()} disabled={pending || !user} size="lg" className="rounded-full">
          <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2.5} className="size-4" />
          {pending ? "Starting…" : "Start a watch party"}
        </Button>

        {/* Secondary path \u2014 a guest who already has the 6-char code (e.g. via DM)
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
              The host\u2019s link includes a token that adds you to the session. Joining by code
              alone only works after you\u2019ve already opened that link once.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Resume point ≈ {Math.floor(startedAt)}s when you start. Guests sync to the host as soon as
          they connect.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 text-sm">
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

      <div className="rounded-xl border border-border/30 bg-black/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Invite link</p>
          <ConnectionPill status={realtimeStatus} />
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <code className="line-clamp-1 flex-1 truncate rounded-md bg-black/40 px-2 py-1.5 text-xs text-white/90">
            {session.inviteUrl}
          </code>
          <Button
            variant="glass"
            size="icon-sm"
            onClick={() => {
              void navigator.clipboard.writeText(session.inviteUrl)
            }}
            aria-label="Copy invite link"
          >
            <HugeiconsIcon icon={Copy01Icon} strokeWidth={2} />
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Code <span className="font-mono">{session.inviteCode}</span> · expires{" "}
          {new Date(session.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      <div className="flex items-center gap-1 rounded-full bg-black/30 p-1 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={cn(
            "flex-1 rounded-full px-3 py-1.5 font-medium transition",
            activeTab === "chat"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-vision-stage-foreground",
          )}
        >
          Live chat
          {comments.length > 0 ? (
            <span className="ml-1.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px]">
              {comments.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("people")}
          className={cn(
            "flex-1 rounded-full px-3 py-1.5 font-medium transition",
            activeTab === "people"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-vision-stage-foreground",
          )}
        >
          People
          <span className="ml-1.5 rounded-full bg-black/30 px-1.5 py-0.5 text-[10px]">
            {members.length}
          </span>
        </button>
      </div>

      {activeTab === "chat" ? (
        <ChatPane
          comments={comments}
          draft={draftComment}
          onDraftChange={setDraftComment}
          onSend={() => sendComment(draftComment)}
          currentUserId={user?.userId ?? null}
        />
      ) : (
        <div>
          {members.length === 0 ? (
            <p className="text-xs text-muted-foreground">Waiting for friends to join\u2026</p>
          ) : (
            <div className="flex flex-col gap-2">
              <AvatarGroup>
                {members.slice(0, 6).map((member) => (
                  <Avatar key={member.authUserId} size="default">
                    <AvatarImage src={avatarSrcForMember(member)} alt="" />
                    <AvatarFallback>
                      {member.displayName.slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </AvatarGroup>
              <ul className="flex flex-col gap-1 text-xs">
                {members.map((member) => (
                  <li
                    key={member.authUserId}
                    className={cn(
                      "flex items-center justify-between rounded-md px-1.5 py-1",
                      member.isHost ? "bg-primary/15 text-primary-foreground" : "text-vision-stage-foreground/80",
                    )}
                  >
                    <span>{member.displayName}</span>
                    {member.isHost ? (
                      <span className="rounded-full bg-primary/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
                        Host
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Guest</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl border border-border/30 bg-black/20 p-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-2 font-medium text-vision-stage-foreground">
          <HugeiconsIcon icon={PlayIcon} strokeWidth={2} className="size-4 text-primary" />
          {isHost ? "You are hosting" : "Following the host"}
        </p>
        <p className="mt-1">
          {isHost
            ? "Only you can pause, seek, or scrub. Changes sync to guests right away."
            : "Playback is locked to the host. You can still change volume, captions, and fullscreen."}
        </p>
      </div>

      {isHost ? (
        <Button
          variant="destructive"
          className="rounded-full"
          disabled={endingParty}
          onClick={() => setEndPartyOpen(true)}
        >
          End party for everyone
        </Button>
      ) : null}

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function ConnectionPill({ status }: { status: RealtimeStatus }) {
  const config: Record<
    RealtimeStatus,
    { label: string; dot: string; text: string }
  > = {
    idle: { label: "Idle", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
    connecting: { label: "Connecting", dot: "bg-amber-400 animate-pulse", text: "text-amber-200" },
    connected: { label: "Live", dot: "bg-emerald-400", text: "text-emerald-200" },
    disconnected: { label: "Reconnecting", dot: "bg-amber-400 animate-pulse", text: "text-amber-200" },
    suspended: { label: "Offline", dot: "bg-orange-400", text: "text-orange-200" },
    failed: { label: "Disconnected", dot: "bg-destructive", text: "text-destructive" },
  }
  const view = config[status]
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
  comments: CommentMessage[]
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  currentUserId: string | null
}

function ChatPane({ comments, draft, onDraftChange, onSend, currentUserId }: ChatPaneProps) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  // Auto-scroll to the newest message whenever the list grows.
  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [comments.length])

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onSend()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        ref={scrollRef}
        className="scrollbar-none flex max-h-[40vh] min-h-32 flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-border/30 bg-black/20 p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {comments.length === 0 ? (
          <p className="m-auto text-center text-xs text-muted-foreground">
            No messages yet. Drop a reaction as you watch \u2014 everyone in the party will see it
            in real time.
          </p>
        ) : (
          comments.map((c) => {
            const mine = c.authorId === currentUserId
            return (
              <div
                key={c.id}
                className={cn(
                  "flex w-full gap-2",
                  mine ? "flex-row-reverse text-right" : "flex-row",
                )}
              >
                <Avatar size="sm">
                  <AvatarImage src={c.authorAvatar || undefined} alt="" />
                  <AvatarFallback>
                    {c.authorName.slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={cn("flex min-w-0 max-w-[80%] flex-col gap-0.5", mine && "items-end")}>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="truncate font-medium text-vision-stage-foreground/85">
                      {mine ? "You" : c.authorName}
                    </span>
                    <span className="font-mono">{formatVideoTime(c.videoTimeSeconds)}</span>
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

      <form className="flex items-center gap-2" onSubmit={onSubmit}>
        <Input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Say something\u2026"
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
