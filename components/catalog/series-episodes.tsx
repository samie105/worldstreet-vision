"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { cn, formatDuration } from "@/lib/utils"
import type { CatalogTitle } from "@/lib/catalog/types"

/** Position+timestamp tuple for a single episode\u2019s playback progress. */
export interface EpisodeProgress {
  positionSeconds: number
  updatedAt: string
}

interface SeriesEpisodesProps {
  title: CatalogTitle
  /** Keyed by `assetId`. Empty/undefined when the viewer hasn\u2019t started any episodes. */
  progressMap?: Record<string, EpisodeProgress>
}

/** Treat anything past 95% as "watched" \u2014 covers credits/skip-intro tail behavior. */
const WATCHED_THRESHOLD = 0.95
/** Above 2% counts as "in progress" so a stray click doesn\u2019t litter the list with Continue pills. */
const IN_PROGRESS_FLOOR = 0.02

interface EpisodeStatus {
  pct: number
  watched: boolean
  inProgress: boolean
}

function statusFor(durationSeconds: number, position: number | undefined): EpisodeStatus {
  if (!position || !durationSeconds || durationSeconds <= 0) {
    return { pct: 0, watched: false, inProgress: false }
  }
  const pct = Math.min(1, Math.max(0, position / durationSeconds))
  return {
    pct,
    watched: pct >= WATCHED_THRESHOLD,
    inProgress: pct >= IN_PROGRESS_FLOOR && pct < WATCHED_THRESHOLD,
  }
}

export function SeriesEpisodes({ title, progressMap }: SeriesEpisodesProps) {
  const seasons = title.seasons ?? []
  const progress = progressMap ?? {}

  // Default to whichever season has the most recent activity \u2014 falls back to S1.
  const initialSeason = React.useMemo(() => {
    let best: { season: number; updatedAt: number } | null = null
    for (const season of seasons) {
      for (const ep of season.episodes) {
        const p = progress[ep.assetId]
        if (!p) continue
        const ts = Date.parse(p.updatedAt)
        if (!Number.isFinite(ts)) continue
        if (!best || ts > best.updatedAt) best = { season: season.number, updatedAt: ts }
      }
    }
    return best?.season ?? seasons[0]?.number ?? 1
  }, [seasons, progress])

  const [activeSeason, setActiveSeason] = React.useState<number>(initialSeason)
  const [seasonOpen, setSeasonOpen] = React.useState(false)
  const current = seasons.find((s) => s.number === activeSeason) ?? seasons[0]

  // Per-season "X of Y watched" counter for the header.
  const seasonStats = React.useMemo(() => {
    if (!current) return { watched: 0, total: 0 }
    let watched = 0
    for (const ep of current.episodes) {
      if (statusFor(ep.durationSeconds, progress[ep.assetId]?.positionSeconds).watched) {
        watched += 1
      }
    }
    return { watched, total: current.episodes.length }
  }, [current, progress])

  if (seasons.length === 0) return null

  return (
    <section className="mt-10" data-testid="series-episodes">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold tracking-tight">Episodes</h2>
          {seasonStats.total > 0 ? (
            <span className="text-xs text-muted-foreground">
              {seasonStats.watched} / {seasonStats.total} watched
            </span>
          ) : null}
        </div>
        <div className="relative">
          <button
            onClick={() => setSeasonOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
            aria-haspopup="listbox"
            aria-expanded={seasonOpen}
          >
            {current?.label ?? "Season"}
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5" />
          </button>
          <AnimatePresence>
            {seasonOpen ? (
              <motion.ul
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute right-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-md border border-border bg-popover shadow-lg"
                role="listbox"
              >
                {seasons.map((season) => {
                  const watchedCount = season.episodes.reduce(
                    (acc, ep) =>
                      acc +
                      (statusFor(ep.durationSeconds, progress[ep.assetId]?.positionSeconds).watched
                        ? 1
                        : 0),
                    0,
                  )
                  return (
                    <li key={season.number}>
                      <button
                        role="option"
                        aria-selected={season.number === activeSeason}
                        onClick={() => {
                          setActiveSeason(season.number)
                          setSeasonOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent",
                          season.number === activeSeason && "text-primary",
                        )}
                      >
                        <span>{season.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {watchedCount}/{season.episodes.length}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      <ol className="flex flex-col gap-3" data-testid="episode-list">
        {current?.episodes.map((episode) => {
          const ep = progress[episode.assetId]
          const status = statusFor(episode.durationSeconds, ep?.positionSeconds)
          const resumeQS =
            status.inProgress && ep ? `?t=${Math.floor(ep.positionSeconds)}` : ""

          return (
            <li key={episode._id}>
              <Link
                href={`/watch/${episode.assetId}${resumeQS}`}
                className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-3 transition hover:bg-card md:flex-row md:items-center md:gap-4"
                data-testid="episode-row"
              >
                <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-md bg-muted md:h-24 md:w-44">
                  {episode.thumbnailUrl ? (
                    <Image
                      src={episode.thumbnailUrl}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 200px"
                      className="object-cover transition duration-500 group-hover:scale-105"
                      unoptimized
                    />
                  ) : null}

                  {/* Hover play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/40">
                    <span className="rounded-full bg-white/95 p-2 text-black opacity-0 transition group-hover:opacity-100">
                      <HugeiconsIcon icon={PlayIcon} strokeWidth={2.5} className="size-4" />
                    </span>
                  </div>

                  {/* Watched checkmark badge */}
                  {status.watched ? (
                    <span
                      className="absolute right-1.5 top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md"
                      aria-label="Watched"
                    >
                      <HugeiconsIcon icon={Tick02Icon} strokeWidth={3} className="size-3" />
                    </span>
                  ) : null}

                  {/* Netflix-style red progress bar */}
                  {status.pct > 0 ? (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
                      <div
                        className={cn(
                          "h-full",
                          status.watched ? "bg-emerald-500" : "bg-primary",
                        )}
                        style={{ width: `${Math.round(status.pct * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      S{episode.seasonNumber} · E{episode.episodeNumber}
                    </p>
                    {status.inProgress ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Continue
                      </span>
                    ) : null}
                    {status.watched ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                        Watched
                      </span>
                    ) : null}
                  </div>
                  <p className="text-base font-semibold leading-tight">
                    {episode.title.replace(/^Episode \d+:\s*/, "")}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {episode.synopsis}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1 text-xs font-medium text-muted-foreground md:shrink-0">
                  <span>{formatDuration(episode.durationSeconds)}</span>
                  {status.inProgress && ep ? (
                    <span className="text-[10px] text-primary">
                      {Math.max(
                        1,
                        Math.round((episode.durationSeconds - ep.positionSeconds) / 60),
                      )}
                      m left
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
