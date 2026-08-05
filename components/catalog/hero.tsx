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
  /** Billboard only — the films riding the carousel. Falls back to [title]. */
  titles?: CatalogTitle[]
  /** Billboard only — continue-watching positions keyed by title id. */
  resumeByTitleId?: Record<string, number | undefined>
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

export function Hero({ title, titles, resumeByTitleId, resumeSeconds = 0, variant = "poster" }: HeroProps) {
  if (variant === "billboard") {
    return (
      <HeroBillboard
        titles={titles?.length ? titles : [title]}
        resumeByTitleId={resumeByTitleId ?? { [title._id]: resumeSeconds }}
      />
    )
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
   Billboard variant — the poster is the stage. The same artwork paints the
   background as a heavily blurred, darkened wash (posters carry baked-in
   billing text, so it must never read), with the crisp portrait poster
   centered on top under a circular Play. Identity sits to the left of the
   poster, the billing block to the right; below lg everything stacks into
   one centered column with the poster on top.
   ──────────────────────────────────────────────────────────────────────── */

function formatRuntime(seconds: number): string | null {
  if (!seconds || seconds <= 0) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function HeroBillboard({
  titles,
  resumeByTitleId = {},
}: {
  titles: CatalogTitle[]
  resumeByTitleId?: Record<string, number | undefined>
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = React.useState(0)
  const [paused, setPaused] = React.useState(false)
  const [muted, setMuted] = React.useState(true)
  const [clipsReady, setClipsReady] = React.useState(false)

  // Hold the trailers back for a beat so the posters land first and the page
  // isn't fighting the network on first paint.
  React.useEffect(() => {
    const id = window.setTimeout(() => setClipsReady(true), 1_400)
    return () => window.clearTimeout(id)
  }, [])

  // Native scroll + snap does the carriage work: it survives any breakpoint
  // without panel-width arithmetic, and gives touch swiping for free.
  const goTo = React.useCallback((next: number) => {
    const track = trackRef.current
    if (!track) return
    const panel = track.children[next] as HTMLElement | undefined
    if (!panel) return
    track.scrollTo({ left: panel.offsetLeft, behavior: "smooth" })
  }, [])

  // Auto-advance one panel at a time. Pauses on hover/focus, while dragging,
  // and whenever the tab is hidden — a backgrounded tab must not queue jumps.
  React.useEffect(() => {
    if (paused || titles.length < 2) return
    const id = window.setInterval(() => {
      if (document.hidden) return
      setIndex((i) => {
        const next = (i + 1) % titles.length
        goTo(next)
        return next
      })
    }, 6_500)
    return () => window.clearInterval(id)
  }, [paused, titles.length, goTo])

  // Follow manual swipes so the active panel (and its trailer) stays truthful.
  React.useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const children = Array.from(track.children) as HTMLElement[]
        let nearest = 0
        let best = Infinity
        children.forEach((child, i) => {
          const delta = Math.abs(child.offsetLeft - track.scrollLeft)
          if (delta < best) {
            best = delta
            nearest = i
          }
        })
        setIndex(nearest)
      })
    }
    track.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      track.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  const active = titles[index] ?? titles[0]
  const ambient = active?.posterUrl || active?.backdropUrl || ""

  if (!active) return null

  return (
    <section
      data-testid="hero"
      data-hero-variant="billboard"
      className={cn("relative isolate -mt-14 overflow-hidden md:-mt-16", "vision-hero")}
    >
      <div className="relative w-full overflow-hidden">
        {/* Ambient wash — the ACTIVE panel's artwork, over-scaled and heavily
            blurred so its baked-in billing text can never read, then darkened
            and dissolved into the rows below. It crossfades as panels change. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {ambient ? (
            <Image
              key={ambient}
              src={ambient}
              alt=""
              fill
              priority
              sizes="100vw"
              className="scale-125 object-cover opacity-[0.85] blur-[60px] saturate-[1.7] transition-opacity duration-700"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 vision-stage" />
          )}
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_32%,transparent,rgba(0,0,0,0.55))]" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background via-background/55 to-transparent" />
        </div>

        {/* The carriage. Two panels ride in view on desktop with the next one
            peeking, one at a time on a phone. */}
        <div
          ref={trackRef}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
          className="relative z-10 flex h-svh min-h-[520px] snap-x snap-mandatory items-stretch gap-2 overflow-x-auto scroll-smooth scrollbar-none md:gap-3"
          style={{ scrollbarWidth: "none" }}
        >
          {titles.map((t, i) => (
            <HeroPanel
              key={t._id}
              title={t}
              isActive={i === index}
              clipsReady={clipsReady}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              resumeSeconds={resumeByTitleId[t._id] ?? 0}
              primary={i === 0}
              eager={i < 3}
            />
          ))}
        </div>

        {/* The nav floats over the artwork now, so give it a scrim — a bright
            poster must never swallow the wordmark. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-[15] h-28 bg-gradient-to-b from-black/75 via-black/35 to-transparent"
        />

        {/* Position rail — also the manual control. */}
        {titles.length > 1 ? (
          <div className="absolute inset-x-0 bottom-5 z-20 flex items-center justify-center gap-1.5">
            {titles.map((t, i) => (
              <button
                key={t._id}
                onClick={() => {
                  setIndex(i)
                  goTo(i)
                }}
                aria-label={`Show ${t.title}`}
                aria-current={i === index}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  i === index ? "w-7 bg-primary" : "w-3 bg-white/25 hover:bg-white/45",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** One panel of the carriage: poster art, trailer when it's the live panel,
 *  and the film's identity over a bottom scrim. */
function HeroPanel({
  title,
  isActive,
  clipsReady,
  muted,
  onToggleMute,
  resumeSeconds,
  primary,
  eager,
}: {
  title: CatalogTitle
  isActive: boolean
  clipsReady: boolean
  muted: boolean
  onToggleMute: () => void
  resumeSeconds: number
  primary: boolean
  /** The panels that are on screen at first paint load eagerly — a hero panel
   *  must never sit black waiting for an intersection callback. */
  eager: boolean
}) {
  const art = title.posterUrl || title.backdropUrl
  const runtime = formatRuntime(title.durationSeconds)
  const playHref = `/watch/${title.mainAssetId ?? title.trailerAssetId ?? ""}${
    resumeSeconds > 5 ? `?t=${Math.floor(resumeSeconds)}` : ""
  }`
  const playLabel = resumeSeconds > 5 ? "Resume" : "Play"
  const showClip = Boolean(title.previewClipUrl) && isActive && clipsReady

  return (
    <article
      className={cn(
        "group relative shrink-0 snap-start overflow-hidden bg-surface-sunken",
        "transition-all duration-500",
        "h-full shrink-0 basis-full md:basis-[calc(50%-0.375rem)]",
        isActive ? "opacity-100" : "opacity-70 hover:opacity-95",
      )}
    >
      {art ? (
        <Image
          src={art}
          alt={title.title}
          fill
          priority={eager}
          loading={eager ? "eager" : "lazy"}
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover"
          unoptimized
        />
      ) : null}

      {/* The live panel plays its trailer over the poster. */}
      {showClip ? (
        <PreviewClip
          src={title.previewClipUrl}
          poster={art}
          active
          muted={muted}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}

      {/* Scrim + identity */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/92 via-black/35 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 pb-14 md:p-10 md:pb-16">
        <div className="flex items-center gap-2">
          <span className="h-px w-6 bg-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
            WorldStreet Original
          </span>
        </div>

        <h1 className="text-balance font-bold leading-[1.05] tracking-tight text-white [font-size:clamp(1.5rem,2.4vw,2.5rem)]">
          {title.title}
        </h1>

        <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/75">
          <Badge variant="outline" className="border-white/30 text-white/85">
            {title.maturityRating.toUpperCase()}
          </Badge>
          <span className="tabular-nums">{title.releaseYear}</span>
          {runtime ? (
            <>
              <span aria-hidden className="text-white/30">·</span>
              <span className="tabular-nums">{runtime}</span>
            </>
          ) : null}
          {title.genres.length ? (
            <>
              <span aria-hidden className="text-white/30">·</span>
              <span className="truncate">{title.genres.slice(0, 3).join(" · ")}</span>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Link
            href={playHref}
            data-testid={primary ? "hero-play" : undefined}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-black/40 transition hover:bg-brand-active"
          >
            <HugeiconsIcon icon={PlayIcon} strokeWidth={2.5} className="size-4" />
            {playLabel}
          </Link>
          <Link
            href={`/title/${title.slug}`}
            data-testid={primary ? "hero-info" : undefined}
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/12 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
          >
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />
            More info
          </Link>
          {showClip ? (
            <button
              onClick={onToggleMute}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/35 text-white backdrop-blur-md transition hover:bg-white/15"
              aria-label={muted ? "Unmute trailer" : "Mute trailer"}
            >
              <HugeiconsIcon
                icon={muted ? VolumeMute01Icon : VolumeHighIcon}
                strokeWidth={2}
                className="size-4"
              />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
