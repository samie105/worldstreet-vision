"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, InformationCircleIcon, VolumeMute01Icon, VolumeHighIcon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { PreviewClip } from "@/components/player/preview-clip"
import type { CatalogTitle } from "@/lib/catalog/types"

interface HeroProps {
  title: CatalogTitle
  /** Continue watching position in seconds, used to switch the play CTA to "Resume". */
  resumeSeconds?: number
}

export function Hero({ title, resumeSeconds = 0 }: HeroProps) {
  const [showPreview, setShowPreview] = React.useState(false)
  const [muted, setMuted] = React.useState(true)

  React.useEffect(() => {
    const id = window.setTimeout(() => setShowPreview(true), 1_400)
    return () => window.clearTimeout(id)
  }, [])

  const playHref = `/watch/${title.mainAssetId ?? title.trailerAssetId ?? ""}${
    resumeSeconds > 5 ? `?t=${Math.floor(resumeSeconds)}` : ""
  }`

  return (
    <section
      data-testid="hero"
      className={cn(
        "relative isolate -mt-14 overflow-hidden md:-mt-16",
        "vision-hero",
      )}
    >
      <div className="relative h-[82vh] min-h-[560px] max-h-[860px] w-full">
        {title.backdropUrl ? (
          <Image
            src={title.backdropUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 vision-stage" />
        )}

        {title.previewClipUrl ? (
          <PreviewClip
            src={title.previewClipUrl}
            poster={title.backdropUrl}
            active={showPreview}
            muted={muted}
            className="hidden md:block"
          />
        ) : null}

        {/* Dark mode only: cinematic gradients for text contrast on the image.
            Light mode skips these so the hero stays clean and photo-forward. */}
        <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.45)_45%,rgba(0,0,0,0)_75%)] dark:block" />
        <div className="absolute inset-0 hidden bg-[linear-gradient(180deg,transparent_45%,color-mix(in_oklch,var(--color-background)_55%,transparent)_75%,var(--color-background)_100%)] dark:block" />
        <div className="absolute inset-0 hidden bg-[radial-gradient(80%_60%_at_50%_50%,transparent,rgba(0,0,0,0.35))] dark:block" />

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 pb-10 text-foreground md:px-12 md:pb-16 dark:text-white">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-center gap-2 text-xs"
            >
              <Badge
                variant="premium"
                className="bg-amber-500/20 text-amber-900 dark:bg-amber-500/25 dark:text-amber-200"
              >
                Worldstreet Original
              </Badge>
              <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide dark:border-white/30">
                {title.maturityRating.toUpperCase()}
              </span>
              {title.releaseYear ? (
                <span className="text-[11px] text-muted-foreground dark:text-white/85">{title.releaseYear}</span>
              ) : null}
              <span aria-hidden className="text-muted-foreground dark:text-white/40">
                ·
              </span>
              <span className="text-[11px] capitalize text-muted-foreground dark:text-white/85">{title.kind}</span>
            </motion.div>

            <HeroLogo title={title} />

            {title.tagline ? (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.18, ease: "easeOut" }}
                className="max-w-2xl text-balance text-base font-medium text-foreground/90 md:text-lg dark:text-white/85"
              >
                {title.tagline}
              </motion.p>
            ) : null}

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.26, ease: "easeOut" }}
              className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base dark:text-white/80"
            >
              {title.synopsis}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.34, ease: "easeOut" }}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <Link
                href={playHref}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg shadow-black/40 transition hover:bg-white/90"
                data-testid="hero-play"
              >
                <HugeiconsIcon icon={PlayIcon} strokeWidth={2.5} className="size-4" />
                {resumeSeconds > 5 ? "Resume" : "Play"}
              </Link>
              <Link
                href={`/title/${title.slug}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-5 py-2.5 text-sm font-semibold text-foreground backdrop-blur transition hover:bg-accent dark:border-white/20 dark:bg-white/15 dark:text-white dark:hover:bg-white/25"
                data-testid="hero-info"
              >
                <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />
                More info
              </Link>
              {title.previewClipUrl ? (
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background/70 text-foreground backdrop-blur transition hover:bg-accent md:ml-2 dark:border-white/30 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                  aria-label={muted ? "Unmute preview" : "Mute preview"}
                >
                  <HugeiconsIcon
                    icon={muted ? VolumeMute01Icon : VolumeHighIcon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </button>
              ) : null}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HeroLogo({ title }: { title: CatalogTitle }) {
  const lines = title.logoText.split("\n")
  const containerRef = React.useRef<HTMLDivElement | null>(null)

  // Per-character reveal driven by GSAP. The opacity/transform fall back to
  // their final state if GSAP fails to load, so we never render invisible
  // text.
  React.useEffect(() => {
    let cancelled = false
    let ctx: gsap.Context | null = null
    void import("gsap").then(({ gsap }) => {
      if (cancelled || !containerRef.current) return
      ctx = gsap.context(() => {
        gsap.fromTo(
          containerRef.current!.querySelectorAll("[data-hero-letter]"),
          { yPercent: 60, opacity: 0, rotate: 4 },
          {
            yPercent: 0,
            opacity: 1,
            rotate: 0,
            duration: 0.75,
            ease: "power3.out",
            stagger: 0.018,
          },
        )
      }, containerRef)
    })
    return () => {
      cancelled = true
      ctx?.revert()
    }
  }, [title.slug])

  return (
    <div ref={containerRef} className="flex flex-col gap-1">
      {lines.map((line, lineIndex) => (
        <h1
          key={`${line}-${lineIndex}`}
          className="text-balance font-extrabold uppercase leading-[0.95] tracking-tight text-foreground dark:text-white dark:drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          style={{
            fontSize: "clamp(2.25rem, 5.5vw, 4.75rem)",
            letterSpacing: "-0.02em",
            overflowWrap: "anywhere",
          }}
        >
          {Array.from(line).map((char, charIndex) => (
            <span
              key={`${lineIndex}-${charIndex}`}
              data-hero-letter
              className="inline-block"
              style={{ whiteSpace: char === " " ? "pre" : undefined }}
            >
              {char}
            </span>
          ))}
        </h1>
      ))}
    </div>
  )
}
