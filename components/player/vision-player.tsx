"use client"

import * as React from "react"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlayIcon,
  PauseIcon,
  VolumeHighIcon,
  VolumeMute01Icon,
  VolumeLowIcon,
  ArrowExpand02Icon,
  Cancel01Icon,
  Settings01Icon,
  SubtitleIcon,
  Forward01Icon,
  Backward01Icon,
  CheckmarkCircle02Icon,
  Tv01Icon,
} from "@hugeicons/core-free-icons"

import { cn, formatDuration, clamp } from "@/lib/utils"

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
  /** Top-left back button click handler. */
  onBack?: () => void
}

const SEEK_STEP_SECONDS = 10
const HIDE_OVERLAY_MS = 2_800

export function VisionPlayer({
  src,
  poster,
  autoPlay = true,
  videoRef,
  onLoadedMetadata,
  meta,
  introEndsAtSeconds,
  nextUp,
  rightActions,
  onBack,
}: VisionPlayerProps) {
  const internalRef = React.useRef<HTMLVideoElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const hlsInstance = React.useRef<{ destroy: () => void } | null>(null)
  const hideTimerRef = React.useRef<number | null>(null)

  const [playing, setPlaying] = React.useState(autoPlay)
  const [muted, setMuted] = React.useState(false)
  const [volume, setVolume] = React.useState(1)
  const [duration, setDuration] = React.useState(0)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [bufferedEnd, setBufferedEnd] = React.useState(0)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [showControls, setShowControls] = React.useState(true)
  const [showSettings, setShowSettings] = React.useState(false)
  const [playbackRate, setPlaybackRate] = React.useState(1)
  const [scrubPreview, setScrubPreview] = React.useState<number | null>(null)
  const [seeking, setSeeking] = React.useState(false)
  const [captions, setCaptions] = React.useState<"off" | "english">("off")

  const togglePlay = React.useCallback(() => {
    const video = internalRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [])

  const toggleFullscreen = React.useCallback(() => {
    const node = containerRef.current
    if (!node) return
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
    } else {
      void node.requestFullscreen?.().catch(() => {})
    }
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

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
      return
    }

    let destroyed = false
    void import("hls.js").then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false })
      hlsInstance.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
    })

    return () => {
      destroyed = true
      hlsInstance.current?.destroy()
      hlsInstance.current = null
      if (videoRef.current === video) videoRef.current = null
    }
  }, [src, videoRef])

  React.useEffect(() => {
    const id = window.setTimeout(() => showOverlay(), 0)
    return () => {
      window.clearTimeout(id)
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current)
    }
  }, [showOverlay])

  React.useEffect(() => {
    function onFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
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
          event.preventDefault()
          togglePlay()
          break
        case "f":
          toggleFullscreen()
          break
        case "m":
          setMuted((m) => !m)
          break
        case "arrowleft":
        case "j":
          video.currentTime = Math.max(0, video.currentTime - SEEK_STEP_SECONDS)
          showOverlay()
          break
        case "arrowright":
        case "l":
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
  }, [togglePlay, toggleFullscreen, showOverlay])

  const onLoadedMetadataHandler = () => {
    const video = internalRef.current
    if (!video) return
    setDuration(video.duration || 0)
    onLoadedMetadata?.()
  }

  const onTimeUpdate = () => {
    const video = internalRef.current
    if (!video) return
    setCurrentTime(video.currentTime)
    if (video.buffered.length > 0) {
      try {
        setBufferedEnd(video.buffered.end(video.buffered.length - 1))
      } catch {
        // ignore
      }
    }
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
    const video = internalRef.current
    if (!video || !introEndsAtSeconds) return
    video.currentTime = introEndsAtSeconds
    showOverlay()
  }

  const progressPercent = duration > 0 ? clamp(((scrubPreview ?? currentTime) / duration) * 100, 0, 100) : 0
  const bufferedPercent = duration > 0 ? clamp((bufferedEnd / duration) * 100, 0, 100) : 0

  return (
    <div
      ref={containerRef}
      className={cn(
        "group/player relative h-full w-full select-none bg-black",
        showControls ? "" : "cursor-none",
      )}
      data-testid="vision-player"
      onMouseMove={showOverlay}
      onMouseLeave={() => {
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
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadataHandler}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      >
        {captions === "english" ? (
          <track
            label="English"
            kind="captions"
            srcLang="en"
            // Captions stub for testing
            src="data:text/vtt;base64,V0VCVlRUCg=="
            default
          />
        ) : null}
      </video>

      {!playing && currentTime > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30"
        >
          <span className="rounded-full bg-white/90 p-5 shadow-xl">
            <HugeiconsIcon icon={PlayIcon} strokeWidth={2.5} className="size-8 text-black" />
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
            <TopBar onBack={onBack} meta={meta} rightActions={rightActions} />

            <div className="flex flex-1 items-center justify-center gap-6">
              <CenterButton
                aria-label="Back 10 seconds"
                onClick={(event) => {
                  event.stopPropagation()
                  const v = internalRef.current
                  if (v) v.currentTime = Math.max(0, v.currentTime - SEEK_STEP_SECONDS)
                  showOverlay()
                }}
                size="md"
              >
                <HugeiconsIcon icon={Backward01Icon} strokeWidth={2.5} />
              </CenterButton>
              <CenterButton
                aria-label={playing ? "Pause" : "Play"}
                onClick={(event) => {
                  event.stopPropagation()
                  togglePlay()
                }}
                size="lg"
                primary
              >
                <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} strokeWidth={2.5} />
              </CenterButton>
              <CenterButton
                aria-label="Forward 10 seconds"
                onClick={(event) => {
                  event.stopPropagation()
                  const v = internalRef.current
                  if (v) {
                    v.currentTime = Math.min(v.duration || 0, v.currentTime + SEEK_STEP_SECONDS)
                  }
                  showOverlay()
                }}
                size="md"
              >
                <HugeiconsIcon icon={Forward01Icon} strokeWidth={2.5} />
              </CenterButton>
            </div>

            <div className="flex flex-col gap-2 px-4 pb-5 md:px-10 md:pb-7">
              {introEndsAtSeconds && currentTime > 1 && currentTime < introEndsAtSeconds ? (
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
                      strokeWidth={2}
                    />
                  </CenterButton>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={onVolumeChange}
                    onClick={(event) => event.stopPropagation()}
                    className="hidden h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/30 accent-white md:block"
                    aria-label="Volume"
                  />

                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      setCaptions((c) => (c === "off" ? "english" : "off"))
                    }}
                    aria-label={captions === "off" ? "Turn captions on" : "Turn captions off"}
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15",
                      captions === "english" && "bg-white/15",
                    )}
                  >
                    <HugeiconsIcon icon={SubtitleIcon} strokeWidth={2} />
                  </button>

                  <SettingsMenu
                    open={showSettings}
                    onOpenChange={setShowSettings}
                    playbackRate={playbackRate}
                    onPlaybackRateChange={setPlaybackRate}
                  />

                  <button
                    aria-label="Cast"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <HugeiconsIcon icon={Tv01Icon} strokeWidth={2} />
                  </button>

                  <button
                    aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleFullscreen()
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15"
                    data-testid="player-fullscreen"
                  >
                    <HugeiconsIcon
                      icon={isFullscreen ? Cancel01Icon : ArrowExpand02Icon}
                      strokeWidth={2}
                    />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {nextUp && duration > 0 && currentTime > duration * 0.93 ? (
        <NextUpToast nextUp={nextUp} />
      ) : null}
      {/* swallowed: playing/playbackRate are kept in state for future quality menu */}
    </div>
  )
}

function TopBar({
  onBack,
  meta,
  rightActions,
}: {
  onBack?: () => void
  meta?: VisionPlayerProps["meta"]
  rightActions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 md:px-10 md:pt-6">
      <div className="flex min-w-0 items-center gap-2">
        {onBack ? (
          <button
            onClick={(event) => {
              event.stopPropagation()
              onBack()
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur hover:bg-black/55"
            aria-label="Back"
            data-testid="player-back"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </button>
        ) : null}
        {meta ? (
          <div className="min-w-0">
            {meta.seriesLabel ? (
              <p className="text-[11px] uppercase tracking-[0.25em] text-white/65">
                {meta.seriesLabel}
              </p>
            ) : (
              <p className="text-[11px] uppercase tracking-[0.25em] text-white/65">Now playing</p>
            )}
            <p className="truncate text-base font-semibold drop-shadow-md md:text-lg">
              {meta.title}
            </p>
            {meta.subtitle ? (
              <p className="truncate text-xs text-white/75">{meta.subtitle}</p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">{rightActions}</div>
    </div>
  )
}

function CenterButton({
  children,
  size = "md",
  primary,
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
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white transition",
        primary
          ? "bg-white/95 text-black hover:scale-[1.04] hover:bg-white"
          : "bg-black/40 backdrop-blur hover:bg-black/55",
        sizeClass,
        props.className,
      )}
    >
      {children}
    </button>
  )
}

function ScrubBar({
  duration,
  value,
  bufferedPercent,
  progressPercent,
  onChange,
  onCommit,
}: {
  duration: number
  value: number
  bufferedPercent: number
  progressPercent: number
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onCommit: (
    event: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>,
  ) => void
}) {
  return (
    <div className="relative h-3 w-full" data-testid="player-scrubber">
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
}: {
  open: boolean
  onOpenChange: (value: boolean) => void
  playbackRate: number
  onPlaybackRateChange: (rate: number) => void
}) {
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
        <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
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
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-3.5" />
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
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} className="size-3.5" />
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
