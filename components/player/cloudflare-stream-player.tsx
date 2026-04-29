"use client"

import * as React from "react"

interface CloudflareStreamPlayerProps {
  src: string
  poster?: string
  autoPlay?: boolean
  videoRef: React.MutableRefObject<HTMLVideoElement | null>
  onLoadedMetadata?: () => void
}

export function CloudflareStreamPlayer({
  src,
  poster,
  autoPlay = true,
  videoRef,
  onLoadedMetadata,
}: CloudflareStreamPlayerProps) {
  const internalRef = React.useRef<HTMLVideoElement | null>(null)

  React.useEffect(() => {
    const video = internalRef.current
    if (!video || !src) return

    videoRef.current = video

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src
      return
    }

    let destroyed = false
    let hls: {
      destroy: () => void
      loadSource: (source: string) => void
      attachMedia: (media: HTMLMediaElement) => void
    } | null = null

    void import("hls.js").then(({ default: Hls }) => {
      if (destroyed || !Hls.isSupported()) return
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      })
      hls.loadSource(src)
      hls.attachMedia(video)
    })

    return () => {
      destroyed = true
      hls?.destroy()
      if (videoRef.current === video) videoRef.current = null
    }
  }, [src, videoRef])

  return (
    <video
      ref={internalRef}
      controls
      playsInline
      autoPlay={autoPlay}
      poster={poster}
      onLoadedMetadata={onLoadedMetadata}
      className="h-full w-full bg-black object-contain"
    />
  )
}
