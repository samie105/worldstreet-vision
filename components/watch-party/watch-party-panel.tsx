"use client"

import * as React from "react"
import * as Ably from "ably"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import type { Message, RealtimeChannel, Realtime as RealtimeClient, TokenRequest } from "ably"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, UserMultipleIcon, PlayIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  playerRef: React.MutableRefObject<HTMLVideoElement | null>
  startedAt: number
  /** Fired when session is created, loaded, or cleared (e.g. after ending a party). */
  onSessionChange?: (session: WatchPartySnapshot | null) => void
}

interface PlaybackMessage {
  type: "playback"
  isPlaying: boolean
  positionSeconds: number
  serverAt: number
  version: number
  fromHost: boolean
}

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
const HARD_DRIFT = 4

export function WatchPartyPanel({
  asset,
  title,
  initialMode,
  playerRef,
  startedAt,
  onSessionChange,
}: WatchPartyPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user } = useAuth()
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
  const channelRef = React.useRef<RealtimeChannel | null>(null)
  const realtimeRef = React.useRef<RealtimeClient | null>(null)
  const isHost = !!session && !!user && session.hostId === user.userId
  const lastBroadcastRef = React.useRef<number>(0)
  const lastDbPersistRef = React.useRef<number>(0)
  const broadcastVersionRef = React.useRef(0)
  const lastGuestVersionRef = React.useRef(0)
  const guestSyncedInviteRef = React.useRef<string | null>(null)

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
      const result = await createWatchParty({ titleId: title._id, assetId: asset._id })
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
    void getWatchPartyForParticipant(initialMode).then((res) => {
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
  }, [initialMode, session])

  React.useEffect(() => {
    if (initialMode === "new" && !session) {
      const id = window.setTimeout(() => {
        void startSession()
      }, 0)
      return () => window.clearTimeout(id)
    }
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

      const drift = Math.abs(Number(node.currentTime ?? 0) - data.positionSeconds)
      if (drift > HARD_DRIFT) {
        try {
          node.currentTime = data.positionSeconds
        } catch {
          // ignore
        }
      } else if (drift > DRIFT_TOLERANCE) {
        try {
          node.currentTime = data.positionSeconds
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

    channel.subscribe("playback", onMessage)
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
      realtime.close()
      channelRef.current = null
      realtimeRef.current = null
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
    const interval = window.setInterval(() => {
      const now = Date.now()
      if (now - lastBroadcastRef.current < 2_500) return
      const persist = now - lastDbPersistRef.current >= 28_000
      publishHostPlayback(session.inviteCode, persist ? { persist: true } : undefined)
    }, 8_000)
    return () => window.clearInterval(interval)
  }, [session, isHost, publishHostPlayback])

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
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Invite link</p>
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

      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Together right now
        </p>
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground">Waiting for friends to join…</p>
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
