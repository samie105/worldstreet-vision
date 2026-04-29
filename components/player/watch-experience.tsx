"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { UserMultipleIcon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAuth } from "@/components/auth-provider"
import { saveWatchProgress } from "@/lib/actions/progress"
import type { CatalogAsset, CatalogTitle } from "@/lib/catalog/types"
import type { CloudflarePlaybackResult } from "@/lib/video/cloudflare-stream"
import type { WatchPartySnapshot } from "@/lib/watch-party/snapshot"
import { VisionPlayer } from "@/components/player/vision-player"
import { WatchPartyPanel } from "@/components/watch-party/watch-party-panel"

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
  /** Series episode label like "S1 · E2 — Opening Bell". */
  episodeLabel?: string | null
  nextUp?: NextUpInfo | null
}

const PROGRESS_INTERVAL_MS = 15_000

export function WatchExperience({
  asset,
  title,
  playback,
  resumeAt,
  partyMode,
  episodeLabel,
  nextUp,
}: WatchExperienceProps) {
  const router = useRouter()
  const { user } = useAuth()
  const playerRef = React.useRef<HTMLVideoElement | null>(null)
  const [isPartyOpen, setIsPartyOpen] = React.useState(partyMode !== null)
  const [startedAt] = React.useState(() => resumeAt || 0)
  const [activePartySession, setActivePartySession] = React.useState<WatchPartySnapshot | null>(null)

  const onPartySessionChange = React.useCallback((next: WatchPartySnapshot | null) => {
    setActivePartySession(next)
  }, [])

  const handlePartySheetOpenChange = React.useCallback(
    (open: boolean) => {
      if (
        !open &&
        activePartySession &&
        user?.userId === activePartySession.hostId
      ) {
        if (
          !window.confirm(
            "Close the Watch Together panel? The party stays active for guests until you choose “End party for everyone” in this panel.",
          )
        ) {
          return
        }
      }
      setIsPartyOpen(open)
    },
    [activePartySession, user?.userId],
  )

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
    if (node && resumeAt > 5) {
      try {
        node.currentTime = resumeAt
      } catch {
        // ignore - some HLS players need a small delay
      }
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-black text-white">
      <div className="relative flex-1 min-h-0">
        <VisionPlayer
          src={playback.hlsUrl}
          poster={playback.posterUrl}
          videoRef={playerRef}
          autoPlay
          onLoadedMetadata={onLoaded}
          onBack={() => router.back()}
          meta={{
            title: title?.title ?? "Worldstreet Vision",
            subtitle: title?.tagline,
            seriesLabel: episodeLabel ?? undefined,
          }}
          introEndsAtSeconds={45}
          nextUp={nextUp ?? undefined}
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

      <Sheet open={isPartyOpen} onOpenChange={handlePartySheetOpenChange}>
        <SheetContent
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
