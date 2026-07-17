"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlayIcon,
  PauseIcon,
  VolumeHighIcon,
  VolumeMute01Icon,
  VolumeLowIcon,
  MaximizeScreenIcon,
  MinimizeScreenIcon,
  InformationCircleIcon,
  Cancel01Icon,
  Settings01Icon,
  GoBackward10SecIcon,
  GoForward10SecIcon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons"

import { cn, formatDuration, clamp } from "@/lib/utils"
import type { CatalogTitle } from "@/lib/catalog/types"
import { withPartyQueryOnWatchHref } from "@/lib/watch-party/watch-url"
import {
  addFullscreenChangeListener,
  enterVideoNativeFullscreen,
  exitDocumentFullscreen,
  exitVideoNativeFullscreen,
  getFullscreenElement,
  requestElementFullscreen,
  warnFullscreenUnavailable,
} from "./fullscreen"

interface VisionPlayerProps {
  src: string
  poster?: string
  autoPlay?: boolean
  videoRef: React.MutableRefObject<HTMLVideoElement | null>
  onLoadedMetadata?: () => void
  /** Optional bag of metadata rendered in the top overlay. */
  meta?: {
    title: string
    subtitle?: string
    /** "S1 · E2" style label for series. */
    seriesLabel?: string
  }
  /** When provided, the player surfaces a "Skip intro" button until this time. */
  introEndsAtSeconds?: number
  /** Optional next-up payload for series autoplay. */
  nextUp?: {
    label: string
    href: string
    thumbnailUrl?: string
  }
  /** Right-side overlay (used by Watch Together panel toggle). */
  rightActions?: React.ReactNode
  /** Synopsis, cast & crew — shown in an info drawer (not overlaid constantly). */
  detailFields?: {
    synopsis: string
    cast: string[]
    director: string
    genres: string[]
  }
  /** “More like this” strip at bottom of the player (horizontal scroll inside player bounds). */
  relatedTitles?: CatalogTitle[]
  /** When set, appended to `/watch/[id]` links in the strip. */
  partyInviteCode?: string | null
  /** Top-left back button click handler. */
  onBack?: () => void
  /**
   * `follow-host`: play/pause/seek/keyboard/skip are disabled — sync comes from Ably.
   * Player still allows volume and fullscreen.
   */
  transportMode?: "full" | "follow-host"
}

const SEEK_STEP_SECONDS = 10
const HIDE_OVERLAY_MS = 2_800
/** Softer strokes for overlay icons (Hugeicons defaults feel heavy at 2–2.5). */
const ICON_STROKE = 1.4
const ICON_STROKE_PRIMARY = 1.55

export function VisionPlayer({
  src,
  poster,
  autoPlay = true,
  videoRef,
  onLoadedMetadata,
  meta,
  introEndsAtSeconds,
  nextUp,
  detailFields,
  relatedTitles,
  partyInviteCode,
  rightActions,
  onBack,
  transportMode = "full",
}: VisionPlayerProps) {
  const followHost = transportMode === "follow-host"
  const internalRef = React.useRef<HTMLVideoElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const hlsInstance = React.useRef<{ destroy: () => void } | null>(null)
  const hideTimerRef = React.useRef<number | null>(null)
  /** True while the iPhone-only native <video> fullscreen player is open. */
  const nativeVideoFullscreenRef = React.useRef(false)

  /** Drive from real media `play` / `pause` events — never from `autoPlay` alone (blocked autoplay desyncs UI). */
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [volume, setVolume] = React.useState(1)
  const [duration, setDuration] = React.useState(0)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [bufferedEnd, setBufferedEnd] = React.useState(0)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [showControls, setShowControls] = React.useState(true)
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)
  const [playbackRate, setPlaybackRate] = React.useState(1)
  const [scrubPreview, setScrubPreview] = React.useState<number | null>(null)
  const [seeking, setSeeking] = React.useState(false)


  React.useEffect(() => {
    if (!detailsOpen) return
    setShowControls(true)
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [detailsOpen])

  React.useEffect(() => {
    setPlaying(false)
  }, [src])

  const togglePlay = React.useCallback(() => {
    if (followHost) return
    const video = internalRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => setPlaying(false))
    } else {
      video.pause()
      setPlaying(false)
    }
  }, [followHost])

  const toggleFullscreen = React.useCallback(() => {
    const node = containerRef.current
    const video = internalRef.current

    if (getFullscreenElement()) {
      if (!exitDocumentFullscreen()) warnFullscreenUnavailable()
      return
    }
    // iOS iPhone native player fullscreen doesn't surface via fullscreenElement.
    if (nativeVideoFullscreenRef.current && video) {
      exitVideoNativeFullscreen(video)
      return
    }
    if (node && requestElementFullscreen(node)) return
    // iPhone fallback: no element fullscreen API — use the native video player.
    if (video && enterVideoNativeFullscreen(video)) return
    warnFullscreenUnavailable()
  }, [])

  const showOverlay = React.useCallback(() => {
    setShowControls(true)
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      if (!seeking) setShowControls(false)
    }, HIDE_OVERLAY_MS)
  }, [seeking])

  React.useEffect(() => {
    const video = internalRef.current
    if (!video || !src) return
    videoRef.current = video
    // Safari (native HLS): the `autoPlay` attribute fires after `video.src` is
    // set so playback starts on its own. We still call play() defensively in
    // case autoPlay was blocked by browser policy (it will simply reject).
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
      if (autoPlay) {
        const onLoaded = () => {
          void video.play().catch(() => {})
          video.removeEventListener("loadedmetadata", onLoaded)
        }
        video.addEventListener("loadedmetadata", onLoaded)
      }
      return
    }

    let destroyed = false
    void import("hls.js").then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false })
      hlsInstance.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      // The browser's native `autoPlay` attribute fires before HLS has attached
      // a stream (the dynamic import is async). Trigger play() explicitly once
      // the manifest is parsed so navigating from the title page starts playback
      // immediately instead of waiting for a manual click.
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (autoPlay) void video.play().catch(() => {})
      })
    })

    return () => {
      destroyed = true
      hlsInstance.current?.destroy()
      hlsInstance.current = null
      if (videoRef.current === video) videoRef.current = null
    }
  }, [src, videoRef, autoPlay])

  React.useEffect(() => {
    const id = window.setTimeout(() => showOverlay(), 0)
    return () => {
      window.clearTimeout(id)
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [showOverlay])

  React.useEffect(() => {
    // Standard + prefixed fullscreenchange events (Safari/Firefox/legacy Edge).
    return addFullscreenChangeListener(() => {
      setIsFullscreen(Boolean(getFullscreenElement()))
    })
  }, [])

  React.useEffect(() => {
    // iOS iPhone native <video> fullscreen doesn't fire fullscreenchange —
    // sync state from the webkit begin/end events on the video element itself.
    const video = internalRef.current
    if (!video) return
    const onBegin = () => {
      nativeVideoFullscreenRef.current = true
      setIsFullscreen(true)
    }
    const onEnd = () => {
      nativeVideoFullscreenRef.current = false
      setIsFullscreen(false)
    }
    video.addEventListener("webkitbeginfullscreen", onBegin)
    video.addEventListener("webkitendfullscreen", onEnd)
    return () => {
      video.removeEventListener("webkitbeginfullscreen", onBegin)
      video.removeEventListener("webkitendfullscreen", onEnd)
    }
  }, [])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return
      if (event.target instanceof HTMLTextAreaElement) return
      const video = internalRef.current
      if (!video) return

      switch (event.key.toLowerCase()) {
        case " ":
        case "k":
          if (!followHost) {
            event.preventDefault()
            togglePlay()
          }
          break
        case "f":
          event.preventDefault()
          toggleFullscreen()
          break
        case "m":
          setMuted((m) => !m)
          break
        case "arrowleft":
        case "j":
          if (followHost) break
          event.preventDefault()
          video.currentTime = Math.max(0, video.currentTime - SEEK_STEP_SECONDS)
          showOverlay()
          break
        case "arrowright":
        case "l":
          if (followHost) break
          event.preventDefault()
          video.currentTime = Math.min(video.duration || 0, video.currentTime + SEEK_STEP_SECONDS)
          showOverlay()
          break
        case "arrowup":
          setVolume((v) => clamp(v + 0.05, 0, 1))
          break
        case "arrowdown":
          setVolume((v) => clamp(v - 0.05, 0, 1))
          break
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [togglePlay, toggleFullscreen, showOverlay, followHost])

  const onLoadedMetadataHandler = () => {
    const video = internalRef.current
    if (!video) return
    setDuration(video.duration || 0)
    setPlaying(!video.paused)
    onLoadedMetadata?.()
  }

  const syncBufferedEnd = React.useCallback(() => {
    const video = internalRef.current
    if (!video || video.buffered.length === 0) return
    try {
      setBufferedEnd(video.buffered.end(video.buffered.length - 1))
    } catch {
      // ignore
    }
  }, [])

  const onTimeUpdate = () => {
    const video = internalRef.current
    if (!video) return
    setCurrentTime(video.currentTime)
    syncBufferedEnd()
  }

  const onScrubChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    setSeeking(true)
    setScrubPreview(value)
  }

  const onScrubCommit = (event: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    const video = internalRef.current
    const target = event.currentTarget as HTMLInputElement
    const value = Number(target.value)
    if (!video || Number.isNaN(value)) return
    video.currentTime = value
    setCurrentTime(value)
    setScrubPreview(null)
    setSeeking(false)
    showOverlay()
  }

  const onVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value)
    setVolume(value)
    if (value > 0) setMuted(false)
  }

  React.useEffect(() => {
    const video = internalRef.current
    if (!video) return
    video.volume = volume
    video.muted = muted
    video.playbackRate = playbackRate
  }, [volume, muted, playbackRate])

  const skipIntro = () => {
    if (followHost) return
    const video = internalRef.current
    if (!video || !introEndsAtSeconds) return
    video.currentTime = introEndsAtSeconds
    showOverlay()
  }

  const progressPercent = duration > 0 ? clamp(((scrubPreview ?? currentTime) / duration) * 100, 0, 100) : 0
  const bufferedPercent = duration > 0 ? clamp((bufferedEnd / duration) * 100, 0, 100) : 0
  const canOpenDetails = Boolean(meta || detailFields)

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/player relative max-w-full min-w-0 h-full w-full overflow-hidden bg-black select-none",
        showControls ? "" : "cursor-none",
      )}
      data-testid="vision-player"
      onMouseMove={showOverlay}
      onMouseLeave={() => {
        if (detailsOpen) return
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
        if (!seeking) setShowControls(false)
      }}
    >
      <video
        ref={internalRef}
        autoPlay={autoPlay}
        playsInline
        poster={poster}
        className="h-full w-full bg-black object-contain"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onPlaying={() => setPlaying(true)}
        onProgress={syncBufferedEnd}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadataHandler}
        onClick={() => {
          if (followHost) {
            showOverlay()
            return
          }
          togglePlay()
        }}
        onDoubleClick={toggleFullscreen}
      />

      {/* Single play affordance: hide when controls are open or the center transport row would show through the gradient. */}
      {!playing && currentTime > 0 && !showControls ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-black/30"
        >
          <span className="rounded-full bg-white/90 p-5 shadow-xl">
            <HugeiconsIcon icon={PlayIcon} strokeWidth={ICON_STROKE_PRIMARY} className="size-8 text-black/90" />
          </span>
        </div>
      ) : null}

      <AnimatePresence>
        {showControls ? (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-[2] flex flex-col justify-between bg-gradient-to-b from-black/65 via-black/0 to-black/80 text-white"
          >
            <TopBar
              onBack={onBack}
              onOpenDetails={
                canOpenDetails
                  ? () => {
                      setDetailsOpen(true)
                      showOverlay()
                    }
                  : undefined
              }
              rightActions={rightActions}
            />

            {followHost ? (
              <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-4 md:top-20">
                <p className="rounded-full border border-white/20 bg-black/55 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-white/90 backdrop-blur">
                  Host controls playback
                </p>
              </div>
            ) : null}

            <div className="flex flex-1 items-center justify-center gap-6">
              <CenterButton
                aria-label="Skip back 10 seconds"
                disabled={followHost}
                onClick={(event) => {
                  event.stopPropagation()
                  if (followHost) return
                  const v = internalRef.current
                  if (v) v.currentTime = Math.max(0, v.currentTime - SEEK_STEP_SECONDS)
                  showOverlay()
                }}
                size="md"
              >
                <HugeiconsIcon
                  icon={GoBackward10SecIcon}
                  strokeWidth={ICON_STROKE}
                  className="size-8 text-white/[0.88]"
                />
              </CenterButton>
              <CenterButton
                aria-label={playing ? "Pause" : "Play"}
                disabled={followHost}
                onClick={(event) => {
                  event.stopPropagation()
                  togglePlay()
                }}
                size="lg"
                primary
              >
                <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} strokeWidth={ICON_STROKE_PRIMARY} className="text-black/90" />
              </CenterButton>
              <CenterButton
                aria-label="Skip forward 10 seconds"
                disabled={followHost}
                onClick={(event) => {
                  event.stopPropagation()
                  if (followHost) return
                  const v = internalRef.current
                  if (v) {
                    v.currentTime = Math.min(v.duration || 0, v.currentTime + SEEK_STEP_SECONDS)
                  }
                  showOverlay()
                }}
                size="md"
              >
                <HugeiconsIcon
                  icon={GoForward10SecIcon}
                  strokeWidth={ICON_STROKE}
                  className="size-8 text-white/[0.88]"
                />
              </CenterButton>
            </div>

            <div className="flex min-w-0 max-w-full flex-col gap-2 px-4 pb-5 md:px-10 md:pb-7">
              <RelatedCarouselStrip
                titles={relatedTitles ?? []}
                partyInviteCode={partyInviteCode ?? null}
                onInteract={showOverlay}
              />

              {introEndsAtSeconds && !followHost && currentTime > 1 && currentTime < introEndsAtSeconds ? (
                <div className="flex justify-end">
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      skipIntro()
                    }}
                    className="rounded-md border border-white/40 bg-black/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur transition hover:bg-black/60"
                    data-testid="skip-intro"
                  >
                    Skip intro
                  </button>
                </div>
              ) : null}

              <ScrubBar
                duration={duration}
                value={scrubPreview ?? currentTime}
                bufferedPercent={bufferedPercent}
                progressPercent={progressPercent}
                disabled={followHost}
                onChange={onScrubChange}
                onCommit={onScrubCommit}
              />
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-white/85" data-testid="player-time">
                  {formatDuration(scrubPreview ?? currentTime)} / {formatDuration(duration)}
                </span>

                <div className="flex items-center gap-1.5">
                  <CenterButton
                    aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
                    onClick={(event) => {
                      event.stopPropagation()
                      setMuted((m) => !m)
                    }}
                    size="sm"
                  >
                    <HugeiconsIcon
                      icon={muted || volume === 0 ? VolumeMute01Icon : volume < 0.5 ? VolumeLowIcon : VolumeHighIcon}
                      strokeWidth={ICON_STROKE}
                      className="text-white/88"
                    />
                  </CenterButton>
                  <VolumeSlider
                    volume={volume}
                    muted={muted}
                    onChange={onVolumeChange}
                  />

                  <SettingsMenu
                    open={showSettings}
                    onOpenChange={setShowSettings}
                    playbackRate={playbackRate}
                    onPlaybackRateChange={setPlaybackRate}
                    disabled={followHost}
                  />

                  <button
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleFullscreen()
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white/90 hover:bg-white/15"
                    data-testid="player-fullscreen"
                  >
                    <HugeiconsIcon
                      icon={isFullscreen ? MinimizeScreenIcon : MaximizeScreenIcon}
                      strokeWidth={ICON_STROKE}
                    />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <PlayerDetailsPanel
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        meta={meta}
        detailFields={detailFields}
      />

      {nextUp && duration > 0 && currentTime > duration * 0.93 ? (
        <NextUpToast nextUp={nextUp} />
      ) : null}
      {/* swallowed: playing/playbackRate are kept in state for future quality menu */}
    </div>
  )
}

function TopBar({
  onBack,
  onOpenDetails,
  rightActions,
}: {
  onBack?: () => void
  onOpenDetails?: () => void
  rightActions?: React.ReactNode
}) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 md:px-10 md:pt-6">
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onBack()
            }}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/55"
            aria-label="Back"
            data-testid="player-back"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={ICON_STROKE} />
          </button>
        ) : null}
        {onOpenDetails ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpenDetails()
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/25 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/55"
            aria-label="Show overview and cast"
            data-testid="player-open-details"
          >
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={ICON_STROKE} className="size-4" />
            <span className="hidden sm:inline">Overview & cast</span>
          </button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{rightActions}</div>
    </div>
  )
}

function RelatedCarouselStrip({
  titles,
  partyInviteCode,
  onInteract,
}: {
  titles: CatalogTitle[]
  partyInviteCode: string | null
  onInteract: () => void
}) {
  if (titles.length === 0) return null

  return (
    <div className="relative min-w-0 max-w-full shrink-0">
      <div className="mb-1 flex items-center justify-between gap-2 pr-0.5 pt-0.5">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">
          More like this
        </p>
      </div>
      <div
        className="scrollbar-none flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onPointerDown={() => onInteract()}
        data-testid="player-related-strip"
      >
        {titles.map((item) => (
          <RelatedTitleCard
            key={item._id}
            title={item}
            href={relatedTitleHref(item, partyInviteCode)}
          />
        ))}
      </div>
    </div>
  )
}

function relatedTitleHref(title: CatalogTitle, partyInviteCode: string | null): string {
  const base = title.mainAssetId ? `/watch/${title.mainAssetId}` : `/title/${title.slug}`
  if (partyInviteCode && base.startsWith("/watch/")) {
    return withPartyQueryOnWatchHref(base, partyInviteCode)
  }
  return base
}

function RelatedTitleCard({ title, href }: { title: CatalogTitle; href: string }) {
  const art = title.backdropUrl || title.posterUrl
  return (
    <Link
      href={href}
      scroll
      prefetch
      className="group flex w-[200px] shrink-0 snap-start flex-col gap-1.5 sm:w-[240px] md:w-[280px]"
      onClick={(event) => event.stopPropagation()}
      data-testid="player-related-card"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg shadow-[0_14px_32px_-14px_rgba(0,0,0,0.75)] transition-transform duration-200 group-hover:scale-[1.03]">
        {art ? (
          <Image src={art} alt="" fill className="object-cover" sizes="280px" unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white/45">WS</div>
        )}
      </div>
      <p className="line-clamp-2 px-0.5 text-[11px] font-normal leading-tight text-white/75">{title.title}</p>
    </Link>
  )
}

function PlayerDetailsPanel({
  open,
  onClose,
  meta,
  detailFields,
}: {
  open: boolean
  onClose: () => void
  meta?: VisionPlayerProps["meta"]
  detailFields?: VisionPlayerProps["detailFields"]
}) {
  const hasBody = Boolean(
    (detailFields?.synopsis && detailFields.synopsis.trim().length > 0) ||
      (detailFields?.cast && detailFields.cast.length > 0) ||
      detailFields?.director ||
      (detailFields?.genres && detailFields.genres.length > 0),
  )

  return (
    <AnimatePresence mode="wait">
      {open ? (
        <motion.div
          key="player-details"
          className="pointer-events-auto absolute inset-0 z-[50]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Close details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-0 bg-black/70 backdrop-blur-sm"
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Title details"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="absolute inset-y-0 right-0 z-[5] flex w-full max-w-md flex-col border-l border-white/10 bg-zinc-950/95 text-white shadow-2xl backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                About this title
              </p>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/10"
                aria-label="Close"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={ICON_STROKE} className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 pb-8">
              {meta ? (
                <div className="mb-4">
                  {meta.seriesLabel ? (
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">{meta.seriesLabel}</p>
                  ) : null}
                  <h2 className="text-balance text-xl font-semibold leading-snug">{meta.title}</h2>
                  {meta.subtitle ? (
                    <p className="mt-1 text-sm text-white/80">{meta.subtitle}</p>
                  ) : null}
                </div>
              ) : null}

              {hasBody ? (
                <div className="space-y-4 text-sm leading-relaxed">
                  {detailFields?.synopsis ? (
                    <div>
                      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
                        Overview
                      </h3>
                      <p className="text-pretty text-white/85">{detailFields.synopsis}</p>
                    </div>
                  ) : null}
                  {detailFields?.cast?.length ? (
                    <div>
                      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
                        Cast
                      </h3>
                      <p className="text-white/85">{detailFields.cast.join(", ")}</p>
                    </div>
                  ) : null}
                  {detailFields?.director ? (
                    <div>
                      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
                        Director
                      </h3>
                      <p className="text-white/85">{detailFields.director}</p>
                    </div>
                  ) : null}
                  {detailFields?.genres?.length ? (
                    <div>
                      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/55">
                        Genres
                      </h3>
                      <p className="capitalize text-white/85">{detailFields.genres.join(", ")}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.aside>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function CenterButton({
  children,
  size = "md",
  primary,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: "sm" | "md" | "lg"
  primary?: boolean
}) {
  const sizeClass =
    size === "lg"
      ? "h-16 w-16"
      : size === "sm"
        ? "h-9 w-9"
        : "h-12 w-12"

  return (
    <button
      type="button"
      disabled={disabled}
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white transition",
        primary
          ? "bg-white/95 text-black hover:scale-[1.04] hover:bg-white"
          : "bg-black/40 backdrop-blur hover:bg-black/55",
        disabled && "cursor-not-allowed opacity-40 hover:scale-100",
        sizeClass,
        props.className,
      )}
    >
      {children}
    </button>
  )
}

function VolumeSlider({
  volume,
  muted,
  onChange,
}: {
  volume: number
  muted: boolean
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}) {
  const level = muted ? 0 : volume
  const fillPercent = clamp(level * 100, 0, 100)

  return (
    <div className="relative hidden h-3 w-24 shrink-0 md:block">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/22" />
      <div
        className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary"
        style={{ width: `${fillPercent}%` }}
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onChange={onChange}
        onClick={(event) => event.stopPropagation()}
        aria-label="Volume"
        className={cn(
          "absolute inset-0 cursor-pointer appearance-none bg-transparent accent-primary outline-none",
          "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent",
          "[&::-webkit-slider-thumb]:mt-[-3px] [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white/65",
          "[&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent",
          "[&::-moz-range-thumb]:size-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:ring-2 [&::-moz-range-thumb]:ring-white/65",
        )}
      />
    </div>
  )
}

function ScrubBar({
  duration,
  value,
  bufferedPercent,
  progressPercent,
  disabled,
  onChange,
  onCommit,
}: {
  duration: number
  value: number
  bufferedPercent: number
  progressPercent: number
  disabled?: boolean
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onCommit: (
    event: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>,
  ) => void
}) {
  return (
    <div
      className={cn("relative h-3 w-full", disabled && "pointer-events-none opacity-60")}
      data-testid="player-scrubber"
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/20" />
      <div
        className="absolute inset-y-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-white/35"
        style={{ width: `${bufferedPercent}%` }}
      />
      <div
        className="absolute inset-y-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-primary"
        style={{ width: `${progressPercent}%` }}
      />
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={value}
        onChange={onChange}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        onClick={(event) => event.stopPropagation()}
        className="absolute inset-0 cursor-pointer appearance-none bg-transparent accent-primary"
        aria-label="Seek"
      />
    </div>
  )
}

function SettingsMenu({
  open,
  onOpenChange,
  playbackRate,
  onPlaybackRateChange,
  disabled,
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  playbackRate: number
  onPlaybackRateChange: (rate: number) => void
  disabled?: boolean
}) {
  if (disabled) return null
  return (
    <div className="relative">
      <button
        aria-label="Player settings"
        onClick={(event) => {
          event.stopPropagation()
          onOpenChange(!open)
        }}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15",
          open && "bg-white/15",
        )}
      >
        <HugeiconsIcon icon={Settings01Icon} strokeWidth={ICON_STROKE} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-12 right-0 z-30 w-56 overflow-hidden rounded-xl border border-white/15 bg-black/85 text-white shadow-xl backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wider text-white/70">
              Playback speed
            </p>
            <ul>
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                <li key={rate}>
                  <button
                    onClick={() => {
                      onPlaybackRateChange(rate)
                      onOpenChange(false)
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-white/10",
                      rate === playbackRate && "text-primary",
                    )}
                  >
                    <span>{rate}×</span>
                    {rate === playbackRate ? (
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={ICON_STROKE} className="size-3.5" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
            <p className="border-t border-white/10 px-3 pb-1 pt-2 text-[10px] uppercase tracking-wider text-white/70">
              Quality
            </p>
            <ul>
              {(["Auto", "1080p", "720p", "480p"] as const).map((label) => (
                <li key={label}>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-white/10"
                  >
                    <span>{label}</span>
                    {label === "Auto" ? (
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={ICON_STROKE} className="size-3.5" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function NextUpToast({ nextUp }: { nextUp: NonNullable<VisionPlayerProps["nextUp"]> }) {
  return (
    <motion.a
      href={nextUp.href}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      className="absolute bottom-24 right-4 z-30 flex items-center gap-3 rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-white shadow-2xl backdrop-blur md:right-10"
      data-testid="next-up"
    >
      {nextUp.thumbnailUrl ? (
        <span
          className="block h-12 w-20 shrink-0 rounded bg-cover bg-center"
          role="img"
          aria-label="Next episode thumbnail"
          style={{ backgroundImage: `url(${nextUp.thumbnailUrl})` }}
        />
      ) : null}
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-white/65">Next episode</span>
        <span className="text-sm font-semibold">{nextUp.label}</span>
      </div>
      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-black">
        Play
      </span>
    </motion.a>
  )
}
