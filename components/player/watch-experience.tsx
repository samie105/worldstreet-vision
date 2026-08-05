"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserMultipleIcon } from "@hugeicons/core-free-icons"

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
import { saveWatchProgress } from "@/lib/actions/progress"
import type { CatalogAsset, CatalogTitle } from "@/lib/catalog/types"
import type { CloudflarePlaybackResult } from "@/lib/video/cloudflare-stream"
import type { WatchPartySnapshot } from "@/lib/watch-party/snapshot"
import { VisionPlayer } from "@/components/player/vision-player"
import { WatchPartyPanel } from "@/components/watch-party/watch-party-panel"
import { useRealViewer } from "@/components/watch-party/use-real-viewer"
import { withPartyQueryOnWatchHref } from "@/lib/watch-party/watch-url"

interface NextUpInfo {
  label: string
  href: string
  thumbnailUrl?: string
}

interface WatchExperienceProps {
  asset: CatalogAsset
  title: CatalogTitle | null
  playback: CloudflarePlaybackResult
  resumeAt: number
  partyMode: string | null
  /**
   * Invite token (from `/invite/[code]?token=...` flow) preserved in the URL.
   * Lets a guest deep-link to the watch screen without re-bouncing through
   * the invite landing page.
   */
  partyToken?: string | null
  /**
   * Server-hydrated from the watch party when `?party=` is set (not `new`).
   * Drives initial play/pause so guests match the host before Ably connects.
   */
  partyInitialIsPlaying?: boolean | null
  /** True when server confirmed this viewer is NOT the party host. */
  partyGuestHint?: boolean
  /** True when server confirmed this viewer IS the party host. */
  partyHostHint?: boolean
  /** Series episode label like "S1 · E2 — Opening Bell". */
  episodeLabel?: string | null
  nextUp?: NextUpInfo | null
  /** Suggested titles for the bottom-of-player carousel (genre-matched). */
  relatedTitles?: CatalogTitle[]
}

const PROGRESS_INTERVAL_MS = 15_000

export function WatchExperience({
  asset,
  title,
  playback,
  resumeAt,
  partyMode,
  partyToken = null,
  partyInitialIsPlaying = null,
  partyGuestHint = false,
  partyHostHint = false,
  episodeLabel,
  nextUp,
  relatedTitles = [],
}: WatchExperienceProps) {
  const router = useRouter()
  // Real Clerk identity — the same identity the watch-party server actions and
  // the Ably token route resolve. The generic auth context can hand back the
  // shared dev-bypass user, which would mis-detect the host and lock the host's
  // own transport controls.
  const viewer = useRealViewer()
  const playerRef = React.useRef<HTMLVideoElement | null>(null)
  const [isPartyOpen, setIsPartyOpen] = React.useState(partyMode !== null)
  const [startedAt] = React.useState(() => resumeAt || 0)
  const [activePartySession, setActivePartySession] = React.useState<WatchPartySnapshot | null>(null)
  const [leaveWatchOpen, setLeaveWatchOpen] = React.useState(false)
  const [partyEnded, setPartyEnded] = React.useState(false)

  const onPartySessionChange = React.useCallback((next: WatchPartySnapshot | null) => {
    setActivePartySession(next)
    // Surface the panel when a session appears (e.g. auto-start or invite join)
    // so nobody watches "together" with the social rail hidden.
    if (next) setIsPartyOpen(true)
  }, [])

  const onPartyEnded = React.useCallback(() => {
    setPartyEnded(true)
  }, [])

  /**
   * Transport mode resolution priority:
   *   1. No party param → "full" (solo viewing).
   *   2. partyMode === "new" → "full" (host bootstrap).
   *   3. Live session (source of truth) → host gets "full", guests "follow-host".
   *   4. Server-confirmed host → "full".
   *   5. Unknown / still hydrating → default to "follow-host" so a guest can’t
   *      seek/scrub during the brief loading window.
   */
  const transportMode = (() => {
    if (!partyMode && !activePartySession) return "full" as const
    if (partyMode === "new" && !activePartySession) return "full" as const
    if (activePartySession && viewer) {
      return activePartySession.hostId === viewer.userId
        ? ("full" as const)
        : ("follow-host" as const)
    }
    if (partyHostHint) return "full" as const
    // partyMode is a real code but we haven't confirmed our role yet.
    return partyGuestHint ? ("follow-host" as const) : ("follow-host" as const)
  })()

  const shouldAutoPlay = partyInitialIsPlaying === null ? true : partyInitialIsPlaying

  const requestLeaveWatch = React.useCallback(() => {
    if (activePartySession) {
      setLeaveWatchOpen(true)
      return
    }
    router.back()
  }, [activePartySession, router])

  const confirmLeaveWatch = React.useCallback(() => {
    setLeaveWatchOpen(false)
    router.back()
  }, [router])

  React.useEffect(() => {
    if (!title) return
    const interval = window.setInterval(() => {
      const node = playerRef.current
      if (!node) return
      const currentTime = Number(node.currentTime ?? 0)
      const duration = Number(node.duration ?? 0)
      if (currentTime <= 0 || duration <= 0) return
      void saveWatchProgress({
        titleId: title._id,
        assetId: asset._id,
        positionSeconds: currentTime,
        durationSeconds: duration,
      })
    }, PROGRESS_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [asset._id, title])

  const onLoaded = () => {
    const node = playerRef.current
    if (node && resumeAt >= 0.25 && Number.isFinite(resumeAt)) {
      try {
        node.currentTime = resumeAt
      } catch {
        // ignore - some HLS players need a small delay
      }
    }
  }

  const partyCodeForNext =
    activePartySession?.inviteCode ??
    (partyMode && partyMode !== "new" ? partyMode : null)

  const nextUpEffective = React.useMemo(() => {
    if (!nextUp) return undefined
    if (!partyCodeForNext) return nextUp
    return {
      ...nextUp,
      href: withPartyQueryOnWatchHref(nextUp.href, partyCodeForNext),
    }
  }, [nextUp, partyCodeForNext])

  const detailFields = React.useMemo(() => {
    if (!title) return null
    return {
      synopsis: title.synopsis,
      cast: title.cast,
      director: title.director,
      genres: title.genres,
    }
  }, [title])

  return (
    <div className="relative flex h-full w-full flex-col bg-black text-white">
      <Dialog open={leaveWatchOpen} onOpenChange={setLeaveWatchOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave playback?</DialogTitle>
            <DialogDescription>
              {activePartySession && viewer?.userId === activePartySession.hostId
                ? "You can re-open Watch Together from the player anytime. Guests stay synced until you end the party from the panel."
                : activePartySession
                  ? "You’ll leave this synced session. You can return with the invite link to watch together again."
                  : "Leave this title?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setLeaveWatchOpen(false)}>
              Stay
            </Button>
            <Button type="button" variant="default" onClick={confirmLeaveWatch}>
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        The shared-viewing stage: player + social rail live SIDE BY SIDE.
        Desktop: chat rail (340px) docked right of the player. Mobile: the
        player pins to the top and the chat fills the space below it. The rail
        is hidden with CSS (never unmounted) so the Ably connection, presence
        and sync all survive the user toggling the panel.
      */}
      <div className="flex min-h-0 w-full flex-1 flex-col md:flex-row">
        <div
          className={cn(
            "relative min-h-0 min-w-0",
            isPartyOpen ? "h-[42dvh] flex-none md:h-auto md:flex-1" : "flex-1",
          )}
        >
          <VisionPlayer
            src={playback.hlsUrl}
            poster={playback.posterUrl}
            videoRef={playerRef}
            autoPlay={shouldAutoPlay}
            transportMode={transportMode}
            onLoadedMetadata={onLoaded}
            onBack={requestLeaveWatch}
            meta={{
              title: title?.title ?? "WorldStreet Vision",
              subtitle: title?.tagline,
              seriesLabel: episodeLabel ?? undefined,
            }}
            introEndsAtSeconds={45}
            nextUp={nextUpEffective}
            detailFields={detailFields ?? undefined}
            relatedTitles={title?.kind === "series" ? relatedTitles : []}
            partyInviteCode={partyCodeForNext}
            rightActions={
              <Button
                variant="glass"
                size="sm"
                onClick={() => setIsPartyOpen((value) => !value)}
                data-testid="open-watch-party"
              >
                <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} className="size-4" />
                Watch together
              </Button>
            }
          />
        </div>

        <aside
          className={cn(
            "min-h-0 min-w-0 flex-col overflow-hidden border-white/10 bg-vision-stage text-vision-stage-foreground",
            "md:w-[340px] md:border-l",
            isPartyOpen ? "flex flex-1 border-t md:flex-none md:border-t-0" : "hidden",
          )}
          aria-label="Watch party"
        >
          <WatchPartyPanel
            asset={asset}
            title={title}
            initialMode={partyMode}
            initialToken={partyToken}
            playerRef={playerRef}
            startedAt={startedAt}
            onSessionChange={onPartySessionChange}
            onPartyEnded={onPartyEnded}
            onClose={() => setIsPartyOpen(false)}
          />
        </aside>
      </div>

      {partyEnded ? (
        <Dialog open={partyEnded} onOpenChange={(open) => !open && setPartyEnded(false)}>
          <DialogContent showCloseButton={false} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Watch party ended</DialogTitle>
              <DialogDescription>
                The host ended this session. You can keep watching on your own
                or head back to browse.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setPartyEnded(false)}>
                Keep watching
              </Button>
              <Button type="button" variant="default" onClick={() => router.push("/browse")}>
                Browse
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
