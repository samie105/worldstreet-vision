"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, ArrowDown01Icon } from "@hugeicons/core-free-icons"

import { cn, formatDuration } from "@/lib/utils"
import type { CatalogTitle } from "@/lib/catalog/types"

interface SeriesEpisodesProps {
  title: CatalogTitle
}

export function SeriesEpisodes({ title }: SeriesEpisodesProps) {
  const seasons = title.seasons ?? []
  const [activeSeason, setActiveSeason] = React.useState<number>(seasons[0]?.number ?? 1)
  const [seasonOpen, setSeasonOpen] = React.useState(false)
  const current = seasons.find((s) => s.number === activeSeason) ?? seasons[0]

  if (seasons.length === 0) return null

  return (
    <section className="mt-10" data-testid="series-episodes">
      <header className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">Episodes</h2>
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
                {seasons.map((season) => (
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
                        {season.episodes.length} ep
                      </span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>
      </header>

      <ol className="flex flex-col gap-3" data-testid="episode-list">
        {current?.episodes.map((episode) => (
          <li key={episode._id}>
            <Link
              href={`/watch/${episode.assetId}`}
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
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/40">
                  <span className="rounded-full bg-white/95 p-2 text-black opacity-0 transition group-hover:opacity-100">
                    <HugeiconsIcon icon={PlayIcon} strokeWidth={2.5} className="size-4" />
                  </span>
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  S{episode.seasonNumber} · E{episode.episodeNumber}
                </p>
                <p className="text-base font-semibold leading-tight">
                  {episode.title.replace(/^Episode \d+:\s*/, "")}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {episode.synopsis}
                </p>
              </div>

              <span className="text-xs font-medium text-muted-foreground md:shrink-0">
                {formatDuration(episode.durationSeconds)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
