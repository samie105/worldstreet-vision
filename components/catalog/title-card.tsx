"use client"

import * as React from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"

import { cn, formatDuration } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { PreviewClip } from "@/components/player/preview-clip"
import type { CatalogTitle, TitleBadge } from "@/lib/catalog/types"

interface TitleCardProps {
  title: CatalogTitle
  /** Hover-to-play preview clip. Defaults to true. */
  expandable?: boolean
  /** Optional progress overlay (0-1) used for Continue Watching. */
  progress?: number
  className?: string
  /**
   * Position in a Top 10 rail. The giant outlined numeral is rendered by
   * `TitleRail` (it must crop behind the card's left edge, which is outside
   * this card's overflow-hidden frame) — here it only feeds assistive tech.
   */
  rank?: number
}

const HOVER_DELAY_MS = 600

const BADGE_COPY: Record<TitleBadge, string> = {
  "new-release": "New",
  "new-season": "New Season",
  "recently-added": "Recently Added",
  "leaving-soon": "Leaving Soon",
  top10: "Top 10",
  exclusive: "Exclusive",
}

const BADGE_TONE: Record<TitleBadge, string> = {
  "new-release": "bg-success/95 text-white",
  "new-season": "bg-success/95 text-white",
  "recently-added": "bg-primary/95 text-primary-foreground",
  "leaving-soon": "bg-destructive/95 text-white",
  top10: "bg-foreground/95 text-background",
  exclusive: "bg-primary/95 text-primary-foreground",
}

export function TitleCard({
  title,
  expandable = true,
  progress,
  className,
  rank,
}: TitleCardProps) {
  const router = useRouter()
  const [previewReady, setPreviewReady] = React.useState(false)
  const hoverTimer = React.useRef<number | null>(null)

  const onEnter = () => {
    if (!expandable) return
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setPreviewReady(true), HOVER_DELAY_MS)
  }

  const onLeave = () => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    setPreviewReady(false)
  }

  React.useEffect(
    () => () => {
      if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    },
    [],
  )

  const detailHref = `/title/${title.slug}`

  const goToDetail = () => router.push(detailHref)

  // Real catalog art is a 2:3 IMDb poster. `backdropUrl` is only a fallback —
  // OMDb ships no landscape art, so it usually holds the same portrait image.
  const art = title.posterUrl || title.backdropUrl

  const meta = [
    title.releaseYear ? String(title.releaseYear) : null,
    title.kind === "series" ? "Series" : "Movie",
    title.kind === "movie" && title.durationSeconds > 0
      ? formatDuration(title.durationSeconds)
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={goToDetail}
      role="button"
      tabIndex={0}
      aria-label={`${title.title} — ${meta}`}
      onKeyDown={(e) => {
        if (e.key === "Enter") goToDetail()
      }}
      className={cn(
        "group relative aspect-[2/3] w-full shrink-0 cursor-pointer overflow-visible rounded-lg bg-card",
        "ring-1 ring-border/25 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.42)]",
        "hover:ring-white/20 hover:shadow-[0_22px_48px_-14px_rgba(0,0,0,0.5)]",
        "dark:hover:shadow-[0_28px_64px_-16px_rgba(0,0,0,0.72)]",
        className,
      )}
      data-testid="title-card"
      data-slug={title.slug}
    >
      {/* Name stays in the DOM for assistive tech and the smoke suite, but the
          poster already carries it — the owner asked for no caption. */}
      <span className="sr-only" data-testid="title-name">
        {title.title}
      </span>
      {rank !== undefined ? <span className="sr-only">Ranked {rank}</span> : null}

      <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
          {art ? (
            <Image
              src={art}
              alt=""
              fill
              sizes="(max-width: 640px) 33vw, (max-width: 768px) 24vw, (max-width: 1024px) 20vw, (max-width: 1280px) 17vw, (max-width: 1536px) 14vw, 13vw"
              className="object-cover transition-[transform,filter] duration-[480ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:brightness-[1.06] group-hover:scale-[1.06]"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted px-2 text-center text-[11px] leading-tight text-muted-foreground">
              {title.title}
            </div>
          )}
        </div>

        {/* Light top-and-tail scrim so the chips stay legible on bright posters. */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.42)_0%,rgba(0,0,0,0)_22%,rgba(0,0,0,0)_66%,rgba(0,0,0,0.52)_100%)] opacity-90 transition-opacity duration-[480ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-70" />

        {title.badge ? (
          <div className="absolute inset-x-1.5 top-1.5 flex">
            <Badge
              className={cn(
                "max-w-full truncate rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide shadow-sm",
                BADGE_TONE[title.badge],
              )}
            >
              {BADGE_COPY[title.badge]}
            </Badge>
          </div>
        ) : null}

        {/* Maturity moves to the foot of the poster — a portrait frame is too
            narrow to carry two chips on one line. */}
        <Badge
          variant="muted"
          className={cn(
            "absolute right-1.5 bg-black/55 px-1.5 py-0.5 text-[9px] text-white backdrop-blur",
            progress !== undefined ? "bottom-2.5" : "bottom-1.5",
          )}
        >
          {title.maturityRating.toUpperCase()}
        </Badge>

        {progress !== undefined ? (
          <div className="absolute inset-x-0 bottom-0 z-[3] h-[3px] overflow-hidden bg-white/20">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
        ) : null}

        {expandable && previewReady && title.previewClipUrl ? (
          <PreviewClip src={title.previewClipUrl} poster={art} active muted />
        ) : null}
      </div>
    </div>
  )
}
