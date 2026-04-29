"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, UserMultipleIcon, InformationCircleIcon } from "@hugeicons/core-free-icons"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { TitleListButton } from "@/components/catalog/title-list-button"
import { formatDurationCompact } from "@/lib/utils"
import type { CatalogTitle } from "@/lib/catalog/types"

function ratingHeroLabel(rating: CatalogTitle["maturityRating"]): string {
  const map: Record<CatalogTitle["maturityRating"], string> = {
    g: "G",
    pg: "PG",
    pg13: "PG-13",
    r: "18+",
  }
  return map[rating] ?? String(rating).toUpperCase()
}

interface TitleDetailHeroProps {
  title: CatalogTitle
  related: CatalogTitle[]
  resumeProgressSeconds: number
  mainHref: string | null
  trailerHref: string | null
  watchTogetherHref: string | null
}

const flowParent = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.03 },
  },
}

const flowItem = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
  },
}

/** Solid primary Play — reads bright on the hero */
const playBtnPrimary =
  "inline-flex items-center gap-2 rounded-full bg-white px-[1.15rem] py-2.5 text-sm font-semibold text-neutral-950 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.55)] transition-[background,transform,box-shadow] duration-200 hover:bg-white hover:shadow-[0_12px_40px_-6px_rgba(0,0,0,0.5)] active:scale-[0.99]"
/** Lighter glass — more see-through */
const glassBtn =
  "inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-[1.1rem] py-2.5 text-sm font-medium text-white/95 shadow-[0_6px_36px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-[background,transform] duration-200 hover:bg-white/[0.09] active:scale-[0.99]"
const glassPill =
  "rounded-full bg-white/[0.035] px-2.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-white/80 backdrop-blur-md"

export function TitleDetailHero({
  title,
  related,
  resumeProgressSeconds,
  mainHref,
  trailerHref,
  watchTogetherHref,
}: TitleDetailHeroProps) {
  const [creditsOpen, setCreditsOpen] = React.useState(false)

  return (
    <>
      <section className="relative isolate -mt-14 w-full min-h-dvh overflow-x-hidden md:-mt-16">
        <div className="relative min-h-dvh w-full max-w-full min-w-0">
          {title.backdropUrl ? (
            <Image
              src={title.backdropUrl}
              alt=""
              fill
              priority
              className="object-cover"
              sizes="100vw"
              unoptimized
            />
          ) : (
            <div className="absolute inset-0 vision-stage" aria-hidden />
          )}

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.76)_0%,rgba(0,0,0,0.42)_45%,rgba(0,0,0,0)_78%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.22)_0%,transparent_32%,rgba(0,0,0,0.55)_72%,rgba(0,0,0,0.94)_100%)]"
          />

          <div className="absolute inset-0 flex flex-col justify-end">
            <motion.div
              className="relative mx-auto flex w-full max-w-[1600px] flex-col justify-end px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-24 text-white md:px-12 md:pb-8 md:pt-28"
              variants={flowParent}
              initial="hidden"
              animate="show"
            >
              <motion.div variants={flowItem} className="relative">
                <div className="pointer-events-none absolute right-0 top-0 z-10 flex max-w-[min(100%,11rem)] flex-col items-end gap-0.5 text-right sm:max-w-[13rem]">
                  <p className="text-3xl font-extralight leading-none tracking-tight text-white/95 sm:text-4xl md:text-5xl">
                    {ratingHeroLabel(title.maturityRating)}
                  </p>
                  {title.kind === "movie" && title.durationSeconds > 0 ? (
                    <p className="text-sm font-normal leading-snug tracking-wide text-white/55 sm:text-base md:text-lg">
                      {formatDurationCompact(title.durationSeconds)}
                    </p>
                  ) : title.kind === "series" ? (
                    <p className="max-w-[13rem] text-xs font-normal leading-snug text-white/40 sm:text-sm">
                      Episodic · times vary
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col pr-[min(11rem,30%)] sm:pr-[min(13rem,34%)]">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-amber-400/[0.07] px-2.5 py-0.5 text-[9px] font-normal uppercase tracking-[0.14em] text-amber-50/88 backdrop-blur-md sm:text-[10px]">
                        Worldstreet Original
                      </span>
                      <span className={glassPill}>{title.releaseYear}</span>
                      <span className={`${glassPill} capitalize`}>{title.kind}</span>
                      {title.kind === "series" && title.seasons?.length ? (
                        <span className={glassPill}>
                          {title.seasons.length} season{title.seasons.length === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </div>

                    <h1
                      data-testid="title-name"
                      className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-white/95 sm:text-5xl md:text-6xl"
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {title.title}
                    </h1>
                  </div>

                  {title.tagline ? (
                    <p className="mt-1.5 max-w-3xl text-balance text-base font-normal leading-relaxed text-white/68 sm:text-lg md:text-xl">
                      {title.tagline}
                    </p>
                  ) : null}
                </div>
              </motion.div>

              <motion.div variants={flowItem} className="mt-4 flex flex-wrap items-center gap-2">
                {mainHref ? (
                  <Link href={mainHref} data-testid="title-play" className={playBtnPrimary}>
                    <HugeiconsIcon icon={PlayIcon} strokeWidth={2.25} className="size-4" />
                    {resumeProgressSeconds > 5 ? "Resume" : title.kind === "series" ? "Play S1 · E1" : "Play"}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-white/[0.035] px-[1.1rem] py-2.5 text-sm font-normal text-white/40 backdrop-blur-lg"
                  >
                    Coming soon
                  </button>
                )}
                {trailerHref ? (
                  <Link href={trailerHref} className={glassBtn}>
                    Watch trailer
                  </Link>
                ) : null}
                {watchTogetherHref ? (
                  <Link href={watchTogetherHref} data-testid="title-watch-together" className={glassBtn}>
                    <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} className="size-4" />
                    Watch together
                  </Link>
                ) : null}
                <TitleListButton
                  titleId={title._id}
                  className={`${glassBtn} shadow-none [&]:border-transparent [&]:ring-0`}
                />
                <button
                  type="button"
                  className={glassBtn}
                  onClick={() => setCreditsOpen(true)}
                  data-testid="title-open-credits"
                >
                  <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />
                  Synopsis & credits
                </button>
              </motion.div>

              {related.length > 0 ? (
                <motion.div variants={flowItem} className="mt-9 min-w-0 max-w-full shrink-0 md:mt-10">
                  <p className="mb-0.5 text-[10px] font-normal uppercase tracking-[0.22em] text-white/45 md:text-[11px]">
                    More like this
                  </p>
                  <div className="scrollbar-none flex w-full max-w-full min-w-0 gap-3 overflow-x-auto overflow-y-hidden pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-5 overscroll-x-contain [&::-webkit-scrollbar]:hidden snap-x snap-proximity">
                    {related.map((item) => (
                      <MiniRelatedCard key={item._id} item={item} />
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </motion.div>
          </div>
        </div>
      </section>

      <Sheet open={creditsOpen} onOpenChange={setCreditsOpen}>
        <SheetContent
          side="right"
          className="flex w-full max-w-lg flex-col border-border/60 bg-background sm:max-w-md"
        >
          <SheetHeader className="text-left">
            <SheetTitle>Synopsis & credits</SheetTitle>
          </SheetHeader>
          <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-2">
            <div>
              <h2 className="mb-2 text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground/90">Overview</h2>
              <p className="text-pretty text-sm leading-relaxed text-foreground/88 md:text-[15px] md:leading-relaxed">
                {title.synopsis || "No synopsis provided."}
              </p>
            </div>
            <div className="mt-10 space-y-6 border-t border-border/20 pt-10">
              <div>
                <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">Cast</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{title.cast.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">Director</p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{title.director || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">Genres</p>
                <p className="mt-1.5 text-sm capitalize leading-relaxed text-foreground/90">
                  {title.genres.join(", ") || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">Release</p>
                <p className="mt-1.5 text-sm tabular-nums text-foreground/90">
                  {title.releaseYear ? String(title.releaseYear) : "—"}
                </p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function MiniRelatedCard({ item }: { item: CatalogTitle }) {
  const href = item.mainAssetId ? `/watch/${item.mainAssetId}` : `/title/${item.slug}`
  const art = item.backdropUrl || item.posterUrl
  return (
    <Link
      href={href}
      prefetch
      className="group flex w-[min(88vw,420px)] shrink-0 snap-start flex-col gap-2 sm:w-[min(56vw,380px)] md:w-[400px] lg:w-[min(28vw,460px)]"
      data-testid="title-related-card"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl shadow-[0_24px_56px_-18px_rgba(0,0,0,0.75)] transition-transform duration-500 ease-out group-hover:scale-[1.015]">
        {art ? (
          <Image
            src={art}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 88vw, (max-width: 1280px) 400px, 460px"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/35">WS</div>
        )}
      </div>
      <p className="line-clamp-2 text-base font-normal leading-snug text-white/68 md:text-[17px]">{item.title}</p>
    </Link>
  )
}
