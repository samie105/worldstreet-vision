"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface PreviewClipProps {
  src: string | null
  poster: string
  active: boolean
  muted?: boolean
  className?: string
}

/**
 * Lightweight HLS preview that lazy-loads `hls.js` only when the card is
 * actively hovered. The clip stays paused until `active` flips to true so we
 * don't waste bandwidth on every card in a rail.
 */
export function PreviewClip({ src, poster, active, muted = true, className }: PreviewClipProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const hlsRef = React.useRef<{ destroy: () => void } | null>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    const video = videoRef.current
    if (!video || !src || !active) return

    let cancelled = false
    setReady(false)

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
      const onCanPlay = () => {
        if (!cancelled) {
          setReady(true)
          video.play().catch(() => {})
        }
      }
      video.addEventListener("canplay", onCanPlay, { once: true })
      return () => {
        cancelled = true
        video.removeEventListener("canplay", onCanPlay)
        video.pause()
        video.removeAttribute("src")
        video.load()
      }
    }

    void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, capLevelToPlayerSize: true })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return
        setReady(true)
        video.play().catch(() => {})
      })
    })

    return () => {
      cancelled = true
      hlsRef.current?.destroy()
      hlsRef.current = null
      video.pause()
    }
  }, [src, active])

  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <video
        ref={videoRef}
        className={cn(
          "h-full w-full object-cover transition-opacity duration-500",
          ready && active ? "opacity-100" : "opacity-0",
        )}
        poster={poster}
        muted={muted}
        playsInline
        preload="none"
      />
    </div>
  )
}
