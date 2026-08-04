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
  const { user } = useAuth()
  const playerRef = React.useRef<HTMLVideoElement | null>(null)
  const [isPartyOpen, setIsPartyOpen] = React.useState(partyMode !== null)
  const [startedAt] = React.useState(() => resumeAt || 0)
  const [activePartySession, setActivePartySession] = React.useState<WatchPartySnapshot | null>(null)
  const [leaveWatchOpen, setLeaveWatchOpen] = React.useState(false)
  const [partyEnded, setPartyEnded] = React.useState(false)

  const onPartySessionChange = React.useCallback((next: WatchPartySnapshot | null) => {
    setActivePartySession(next)
  }, [])

  const onPartyEnded = React.useCallback(() => {
    setPartyEnded(true)
  }, [])

  /**
   * Transport mode resolution priority:
   *   1. No party param → "full" (solo viewing).
   *   2. partyMode === "new" → "full" (host bootstrap).
   *   3. Server-confirmed host → "full".
   *   4. Server-confirmed guest OR live session says we’re a guest → "follow-host".
   *   5. Unknown / still hydrating → default to "follow-host" so a guest can’t
   *      seek/scrub during the brief loading window.
   */
  const transportMode = (() => {
    if (!user || !partyMode || partyMode === "new") return "full" as const
    if (partyHostHint) return "full" as const
    if (activePartySession) {
      return activePartySession.hostId === user.userId ? ("full" as const) : ("follow-host" as const)
    }
    // partyMode is a real code but server hasn’t confirmed our role yet.
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
            initialToken={partyToken}
            playerRef={playerRef}
            startedAt={startedAt}
            onSessionChange={onPartySessionChange}
            onPartyEnded={onPartyEnded}
          />
        </SheetContent>
      </Sheet>

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
