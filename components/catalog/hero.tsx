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
  /**
   * "poster"    — blurred portrait wash with the sharp poster on the right and
   *               the uppercase letter-staggered logo treatment.
   * "billboard" — full-bleed landscape backdrop with an editorial billing
   *               block (director / cast / genre / runtime).
   */
  variant?: "poster" | "billboard"
}

export function Hero({ title, resumeSeconds = 0, variant = "poster" }: HeroProps) {
  if (variant === "billboard") {
    return <HeroBillboard title={title} resumeSeconds={resumeSeconds} />
  }
  return <HeroPoster title={title} resumeSeconds={resumeSeconds} />
}

function HeroPoster({ title, resumeSeconds = 0 }: Omit<HeroProps, "variant">) {
  const [showPreview, setShowPreview] = React.useState(false)
  const [muted, setMuted] = React.useState(true)

  React.useEffect(() => {
    const id = window.setTimeout(() => setShowPreview(true), 1_400)
    return () => window.clearTimeout(id)
  }, [])

  const playHref = `/watch/${title.mainAssetId ?? title.trailerAssetId ?? ""}${
    resumeSeconds > 5 ? `?t=${Math.floor(resumeSeconds)}` : ""
  }`

  const art = title.posterUrl || title.backdropUrl

  return (
    <section
      data-testid="hero"
      className={cn(
        "relative isolate -mt-14 overflow-hidden md:-mt-16",
        "vision-hero",
      )}
    >
      <div className="relative h-[82vh] min-h-[560px] max-h-[860px] w-full overflow-hidden">
        {art ? (
          <>
            {/* Portrait poster can't fill a 16:9 stage — a blurred, over-scaled
                copy paints the frame and the sharp poster sits on top of it. */}
            <Image
              src={art}
              alt=""
              fill
              priority
              sizes="100vw"
              className="scale-125 object-cover opacity-60 blur-2xl saturate-150"
              unoptimized
            />
            <div className="absolute inset-0 flex items-start justify-center pt-20 md:items-center md:justify-end md:pr-[7%] md:pt-0">
              <div className="relative aspect-[2/3] h-[44%] max-w-[58vw] overflow-hidden rounded-xl shadow-[0_40px_110px_-30px_rgba(0,0,0,0.95)] ring-1 ring-white/12 md:h-[68%] md:max-w-none">
                <Image
                  src={art}
                  alt={title.title}
                  fill
                  priority
                  sizes="(max-width: 768px) 58vw, 32vw"
                  className="object-cover"
                  unoptimized
                />
              </div>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 vision-stage" />
        )}

        {title.previewClipUrl ? (
          <PreviewClip
            src={title.previewClipUrl}
            poster={art}
            active={showPreview}
            muted={muted}
            className="hidden md:block"
          />
        ) : null}

        {/* Fixed cinematic scrim — always dark overlay for legible white type (not theme-dependent). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.5)_38%,rgba(0,0,0,0.12)_64%,rgba(0,0,0,0)_84%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.3)_0%,rgba(0,0,0,0.08)_26%,rgba(0,0,0,0.72)_62%,rgba(0,0,0,0.96)_100%)] md:bg-[linear-gradient(180deg,rgba(0,0,0,0.22)_0%,transparent_34%,rgba(0,0,0,0.5)_78%,rgba(0,0,0,0.94)_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_55%_45%,transparent,rgba(0,0,0,0.28))]"
        />

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 pb-10 text-white md:px-12 md:pb-16">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-center gap-2 text-xs text-white"
            >
              <Badge variant="premium" className="border border-primary/35 bg-primary/15 text-primary">
                WorldStreet Original
              </Badge>
              <span className="rounded-md border border-white/35 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                {title.maturityRating.toUpperCase()}
              </span>
              {title.releaseYear ? (
                <span className="text-[11px] text-white/85">{title.releaseYear}</span>
              ) : null}
              <span aria-hidden className="text-white/40">
                ·
              </span>
              <span className="text-[11px] capitalize text-white/85">{title.kind}</span>
            </motion.div>

            <HeroLogo title={title} />

            {title.tagline ? (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.18, ease: "easeOut" }}
                className="line-clamp-2 max-w-2xl text-balance text-base font-medium text-white/90 md:text-lg"
              >
                {title.tagline}
              </motion.p>
            ) : null}

            {/* Real OMDb plots run 200+ words. Clamp here; the detail page
                carries the full text in the synopsis sheet. */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.26, ease: "easeOut" }}
              className="line-clamp-3 max-w-xl text-pretty text-sm leading-relaxed text-white/78 md:max-w-2xl md:text-base"
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
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/40 transition hover:bg-brand-active"
                data-testid="hero-play"
              >
                <HugeiconsIcon icon={PlayIcon} strokeWidth={2.5} className="size-4" />
                {resumeSeconds > 5 ? "Resume" : "Play"}
              </Link>
              <Link
                href={`/title/${title.slug}`}
                className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/12 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
                data-testid="hero-info"
              >
                <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />
                More info
              </Link>
              {title.previewClipUrl ? (
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white backdrop-blur-md transition hover:bg-white/15 md:ml-2"
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
          className="text-balance font-extrabold uppercase leading-[0.95] tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
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

/* ────────────────────────────────────────────────────────────────────────
   Billboard variant — the backdrop is the stage. Editorial left column with
   a film-poster billing block; type is mixed-case Poppins instead of the
   uppercase logo treatment. Gold appears twice only: eyebrow rule + Play.
   ──────────────────────────────────────────────────────────────────────── */

function formatRuntime(seconds: number): string | null {
  if (!seconds || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

const billboardItem = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.2, 0, 0, 1] as const },
  },
}

function HeroBillboard({ title, resumeSeconds = 0 }: Omit<HeroProps, "variant">) {
  const [showPreview, setShowPreview] = React.useState(false)
  const [muted, setMuted] = React.useState(true)

  React.useEffect(() => {
    const id = window.setTimeout(() => setShowPreview(true), 1_400)
    return () => window.clearTimeout(id)
  }, [])

  const playHref = `/watch/${title.mainAssetId ?? title.trailerAssetId ?? ""}${
    resumeSeconds > 5 ? `?t=${Math.floor(resumeSeconds)}` : ""
  }`

  const art = title.backdropUrl || title.posterUrl
  const runtime = formatRuntime(title.durationSeconds)

  const billing: { label: string; value: string }[] = [
    title.director ? { label: "Directed by", value: title.director } : null,
    title.cast.length
      ? { label: "Starring", value: title.cast.slice(0, 3).join(", ") }
      : null,
    title.genres.length
      ? { label: "Genre", value: title.genres.slice(0, 3).join(" · ") }
      : null,
    runtime ? { label: "Runtime", value: runtime } : null,
  ].filter((row): row is { label: string; value: string } => row !== null)

  return (
    <section
      data-testid="hero"
      data-hero-variant="billboard"
      className={cn("relative isolate -mt-14 overflow-hidden md:-mt-16", "vision-hero")}
    >
      <div className="relative h-[82vh] max-h-[860px] min-h-[560px] w-full overflow-hidden">
        {art ? (
          <motion.div
            initial={{ scale: 1.06 }}
            animate={{ scale: 1 }}
            transition={{ duration: 9, ease: "easeOut" }}
            className="absolute inset-0"
          >
            <Image
              src={art}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-top"
              unoptimized
            />
          </motion.div>
        ) : (
          <div className="absolute inset-0 vision-stage" />
        )}

        {title.previewClipUrl ? (
          <PreviewClip
            src={title.previewClipUrl}
            poster={art}
            active={showPreview}
            muted={muted}
            className="hidden md:block"
          />
        ) : null}

        {/* Cinematic scrims: heavy left panel for legible type, bottom fade
            into the page background — always dark, never theme-dependent. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.88)_0%,rgba(0,0,0,0.62)_34%,rgba(0,0,0,0.18)_62%,rgba(0,0,0,0)_82%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.35)_0%,rgba(0,0,0,0.05)_30%,rgba(0,0,0,0.55)_72%,rgba(0,0,0,0.92)_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-background to-transparent"
        />

        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 text-white md:px-12 md:pb-16">
            <motion.div
              initial="hidden"
              animate="show"
              transition={{ staggerChildren: 0.09 }}
              className="flex max-w-xl flex-col gap-4"
            >
              {/* Eyebrow: one gold rule + label, the variant's brand moment. */}
              <motion.div variants={billboardItem} className="flex items-center gap-3">
                <span aria-hidden className="h-px w-8 bg-primary" />
                <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary">
                  WorldStreet Original
                </span>
                <span className="rounded-sm border border-white/35 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white">
                  {title.maturityRating.toUpperCase()}
                </span>
                {title.releaseYear ? (
                  <span className="text-[11px] text-white/70">{title.releaseYear}</span>
                ) : null}
              </motion.div>

              <motion.h1
                variants={billboardItem}
                className="text-balance font-bold leading-[1.02] tracking-tight text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
                style={{ fontSize: "clamp(2.5rem, 5vw, 4.25rem)", letterSpacing: "-0.02em" }}
              >
                {title.title}
              </motion.h1>

              {title.tagline ? (
                <motion.p
                  variants={billboardItem}
                  className="line-clamp-2 text-pretty text-base font-medium text-white/88 md:text-lg"
                >
                  {title.tagline}
                </motion.p>
              ) : (
                <motion.p
                  variants={billboardItem}
                  className="line-clamp-2 max-w-lg text-pretty text-sm leading-relaxed text-white/75 md:text-base"
                >
                  {title.synopsis}
                </motion.p>
              )}

              {billing.length ? (
                <motion.dl variants={billboardItem} className="mt-1 max-w-md">
                  {billing.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline gap-4 border-t border-white/12 py-1.5 first:border-t-0"
                    >
                      <dt className="w-24 shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">
                        {row.label}
                      </dt>
                      <dd className="truncate text-sm text-white/90">{row.value}</dd>
                    </div>
                  ))}
                </motion.dl>
              ) : null}

              <motion.div
                variants={billboardItem}
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <Link
                  href={playHref}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/40 transition hover:bg-brand-active"
                  data-testid="hero-play"
                >
                  <HugeiconsIcon icon={PlayIcon} strokeWidth={2.5} className="size-4" />
                  {resumeSeconds > 5 ? "Resume" : "Play"}
                </Link>
                <Link
                  href={`/title/${title.slug}`}
                  className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/12 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
                  data-testid="hero-info"
                >
                  <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />
                  More info
                </Link>
                {title.previewClipUrl ? (
                  <button
                    onClick={() => setMuted((m) => !m)}
                    className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white backdrop-blur-md transition hover:bg-white/15 md:ml-2"
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
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  )
}
