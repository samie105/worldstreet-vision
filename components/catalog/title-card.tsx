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
  /** Used by the Top 10 rail to render a giant outline number behind the card. */
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
  "new-release": "bg-emerald-500/95 text-white",
  "new-season": "bg-emerald-500/95 text-white",
  "recently-added": "bg-amber-500/95 text-amber-950",
  "leaving-soon": "bg-rose-500/95 text-white",
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

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={goToDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") goToDetail()
      }}
      className={cn(
        "group relative aspect-video w-full shrink-0 cursor-pointer overflow-visible rounded-xl bg-card",
        "ring-1 ring-border/25 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.42)]",
        "hover:ring-white/20 hover:shadow-[0_22px_48px_-14px_rgba(0,0,0,0.5)]",
        "dark:hover:shadow-[0_28px_64px_-16px_rgba(0,0,0,0.72)]",
        className,
      )}
      data-testid="title-card"
      data-slug={title.slug}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[inherit]">
        {rank !== undefined ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -left-3 top-1/2 z-10 -translate-y-1/2 select-none font-extrabold leading-none text-foreground/15 mix-blend-overlay"
            style={{ fontSize: "min(140px, 80%)" }}
          >
            {rank}
          </span>
        ) : null}

        <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
          {title.backdropUrl ? (
            <Image
              src={title.backdropUrl}
              alt=""
              fill
              sizes="(max-width: 640px) 75vw, (max-width: 1024px) 46vw, (max-width: 1536px) 32vw, 28vw"
              className="object-cover transition-[transform,filter] duration-[480ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:brightness-[1.04] group-hover:scale-[1.08]"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
              No artwork
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/88 via-black/35 to-black/0 transition-opacity duration-[480ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:from-black/80 group-hover:via-black/28" />

        <div className="absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-1.5">
          {title.badge ? (
            <Badge
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-sm",
                BADGE_TONE[title.badge],
              )}
            >
              {BADGE_COPY[title.badge]}
            </Badge>
          ) : (
            <span />
          )}
          <Badge
            variant="muted"
            className="bg-black/55 text-[10px] text-white backdrop-blur"
          >
            {title.maturityRating.toUpperCase()}
          </Badge>
        </div>

        <div className="absolute inset-x-3 bottom-3 z-[2] flex flex-col gap-1.5 text-white">
          <p
            className="text-sm font-semibold leading-snug md:text-base"
            style={{ overflowWrap: "anywhere" }}
          >
            {title.title}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-white/85 md:text-xs">
            <span>{title.releaseYear}</span>
            <span aria-hidden>·</span>
            <span className="capitalize">{title.kind}</span>
            {title.kind === "movie" && title.durationSeconds > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>{formatDuration(title.durationSeconds)}</span>
              </>
            ) : null}
          </div>
        </div>

        {progress !== undefined ? (
          <div className="absolute inset-x-2 bottom-2 z-[3] h-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
        ) : null}

        {expandable && previewReady && title.previewClipUrl ? (
          <PreviewClip src={title.previewClipUrl} poster={title.backdropUrl} active muted />
        ) : null}
      </div>
    </div>
  )
}
