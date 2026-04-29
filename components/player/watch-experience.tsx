"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserMultipleIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAuth } from "@/components/auth-provider"
import { saveWatchProgress } from "@/lib/actions/progress"
import type { CatalogAsset, CatalogTitle } from "@/lib/catalog/types"
import type { CloudflarePlaybackResult } from "@/lib/video/cloudflare-stream"
import type { WatchPartySnapshot } from "@/lib/watch-party/snapshot"
import { VisionPlayer } from "@/components/player/vision-player"
import { WatchPartyPanel } from "@/components/watch-party/watch-party-panel"
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
   * Server-hydrated from the watch party when `?party=` is set (not `new`).
   * Drives initial play/pause so guests match the host before Ably connects.
   */
  partyInitialIsPlaying?: boolean | null
  /** True when server knows this viewer is not the party host (instant guest transport lock). */
  partyGuestHint?: boolean
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
  partyInitialIsPlaying = null,
  partyGuestHint = false,
  episodeLabel,
  nextUp,
  relatedTitles = [],
}: WatchExperienceProps) {
  const router = useRouter()
  const { user } = useAuth()
  const playerRef = React.useRef<HTMLVideoElement | null>(null)
  const [isPartyOpen, setIsPartyOpen] = React.useState(partyMode !== null)
  const [startedAt] = React.useState(() => resumeAt || 0)
  const [activePartySession, setActivePartySession] = React.useState<WatchPartySnapshot | null>(null)
  const [leaveWatchOpen, setLeaveWatchOpen] = React.useState(false)

  const onPartySessionChange = React.useCallback((next: WatchPartySnapshot | null) => {
    setActivePartySession(next)
  }, [])

  const transportMode =
    user &&
    partyMode &&
    partyMode !== "new" &&
    (partyGuestHint ||
      (!!activePartySession && user.userId !== activePartySession.hostId))
      ? "follow-host"
      : "full"

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
              {activePartySession && user?.userId === activePartySession.hostId
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

      <div className="relative min-h-0 flex-1">
        <VisionPlayer
          src={playback.hlsUrl}
          poster={playback.posterUrl}
          videoRef={playerRef}
          autoPlay={shouldAutoPlay}
          transportMode={transportMode}
          onLoadedMetadata={onLoaded}
          onBack={requestLeaveWatch}
          meta={{
            title: title?.title ?? "Worldstreet Vision",
            subtitle: title?.tagline,
            seriesLabel: episodeLabel ?? undefined,
          }}
          introEndsAtSeconds={45}
          nextUp={nextUpEffective}
          detailFields={detailFields ?? undefined}
          relatedTitles={relatedTitles}
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

      <Sheet open={isPartyOpen} onOpenChange={setIsPartyOpen}>
        <SheetContent
          keepMounted
          side="right"
          className="w-full max-w-md bg-vision-stage text-vision-stage-foreground"
        >
          <SheetHeader>
            <SheetTitle>Watch Together</SheetTitle>
          </SheetHeader>
          <WatchPartyPanel
            asset={asset}
            title={title}
            initialMode={partyMode}
            playerRef={playerRef}
            startedAt={startedAt}
            onSessionChange={onPartySessionChange}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}
