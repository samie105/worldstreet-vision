"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  PlayIcon,
  UserMultipleIcon,
  InformationCircleIcon,
  MoreVerticalIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TitleListButton } from "@/components/catalog/title-list-button"
import { cn, formatDurationCompact } from "@/lib/utils"
import { posterAtWidth } from "@/lib/catalog/poster"
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
  "inline-flex items-center gap-2 rounded-md bg-primary px-[1.15rem] py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_32px_-8px_rgba(0,0,0,0.55)] transition-[background,transform,box-shadow] duration-200 hover:bg-brand-active hover:shadow-[0_12px_40px_-6px_rgba(0,0,0,0.5)] active:scale-[0.99]"
/** Lighter glass — more see-through */
const glassBtn =
  "inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-[1.1rem] py-2.5 text-sm font-medium text-white/95 shadow-[0_6px_36px_-12px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-[background,transform] duration-200 hover:bg-white/[0.09] active:scale-[0.99]"
/** Icon-only circular — matches hero glass, sized for thumb */
const heroIconCircleBtn =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white shadow-[0_6px_28px_-10px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-[background,transform] duration-200 hover:bg-white/[0.11] active:scale-[0.97]"
const glassPill =
  "rounded-full bg-white/[0.035] px-2.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-white/80 backdrop-blur-md"

const heroMenuLink =
  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white/93 transition-[background,color] duration-200 hover:bg-white/[0.09] hover:text-white"

export function TitleDetailHero({
  title,
  related,
  resumeProgressSeconds,
  mainHref,
  trailerHref,
  watchTogetherHref,
}: TitleDetailHeroProps) {
  const [creditsOpen, setCreditsOpen] = React.useState(false)

  const movieLockMobile = title.kind === "movie"

  const art = posterAtWidth(title.posterUrl || title.backdropUrl, 900)

  return (
    <>
      <section
        className={cn(
          "relative isolate -mt-14 w-full overflow-x-hidden md:-mt-16 md:overflow-x-visible",
          movieLockMobile
            ? /* Fits main chrome: LayoutShell pt-14 + pb-20 (mobile bottom tab bar reserve) */
              "max-md:h-[calc(100dvh-3.5rem-5rem)] max-md:max-h-[calc(100dvh-3.5rem-5rem)] max-md:overflow-hidden"
            : "md:min-h-dvh",
          !movieLockMobile && "max-md:min-h-0",
        )}
      >
        <div
          className={cn(
            "relative min-h-0 w-full overflow-hidden",
            movieLockMobile ? "max-md:h-full md:min-h-dvh" : "min-h-dvh",
          )}
        >
          {art ? (
            <>
              {/* Blurred, over-scaled copy of the 2:3 poster fills the stage so
                  the sharp poster never has to be cropped or stretched. */}
              <Image
                src={art}
                alt=""
                fill
                priority
                className="scale-125 object-cover opacity-60 blur-2xl saturate-150"
                sizes="100vw"
                unoptimized
              />
            </>
          ) : (
            <div className="absolute inset-0 vision-stage" aria-hidden />
          )}

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.8)_0%,rgba(0,0,0,0.46)_40%,rgba(0,0,0,0.1)_66%,rgba(0,0,0,0)_86%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.28)_0%,rgba(0,0,0,0.06)_24%,rgba(0,0,0,0.7)_58%,rgba(0,0,0,0.95)_100%)] md:bg-[linear-gradient(180deg,rgba(0,0,0,0.22)_0%,transparent_32%,rgba(0,0,0,0.5)_70%,rgba(0,0,0,0.94)_100%)]"
          />

          <div
            className={cn(
              "absolute inset-0 flex min-h-0 flex-col justify-end md:max-h-none",
              movieLockMobile ? "max-md:h-full" : "",
            )}
          >
            <motion.div
              className={cn(
                "relative mx-auto flex min-h-0 w-full max-w-[1600px] flex-col justify-end px-4 pb-2 pt-20 text-white md:max-h-none md:px-12 md:pb-8 md:pt-24",
                movieLockMobile && "max-md:flex-1 max-md:min-h-0 max-md:overflow-hidden",
              )}
              variants={flowParent}
              initial="hidden"
              animate="show"
            >
              {art ? (
                <motion.div variants={flowItem} className="mb-5 shrink-0 md:mb-7">
                  <div className="relative aspect-[2/3] w-[38vw] max-w-[190px] overflow-hidden rounded-xl shadow-[0_40px_110px_-30px_rgba(0,0,0,0.95)] ring-1 ring-white/12 md:w-[15vw] md:max-w-[230px]">
                    <Image
                      src={art}
                      alt={title.title}
                      fill
                      priority
                      sizes="(max-width: 768px) 38vw, 15vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                </motion.div>
              ) : null}

              <motion.div variants={flowItem} className="relative min-h-0 max-md:flex-shrink">
                {/* Rating · duration stays top-right; keep its column narrow on mobile */}
                <div className="pointer-events-none absolute right-0 top-0 z-10 flex max-w-[5rem] flex-col items-end gap-0.5 text-right sm:max-w-[13rem] md:max-w-[min(100%,11rem)]">
                  <p className="text-2xl font-extralight leading-none tracking-tight text-white/95 tabular-nums sm:text-4xl md:text-5xl">
                    {ratingHeroLabel(title.maturityRating)}
                  </p>
                  {title.kind === "movie" && title.durationSeconds > 0 ? (
                    <p className="text-[11px] font-normal leading-tight tracking-wide text-white/55 sm:text-base md:text-lg">
                      {formatDurationCompact(title.durationSeconds)}
                    </p>
                  ) : title.kind === "series" ? (
                    <p className="max-w-[4.75rem] text-[10px] font-normal leading-tight text-white/40 sm:text-sm md:max-w-[13rem]">
                      Episodic · times vary
                    </p>
                  ) : null}
                </div>

                {/* Text block: give tagline usable width beside rating on mobile */}
                <div className="flex flex-col pr-[clamp(5rem,26vw,6.5rem)] sm:pr-[min(13rem,34%)] md:pr-[min(13rem,34%)] lg:pr-[min(11rem,30%)]">
                  <div className="flex flex-col gap-0.5 md:gap-1">
                    <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                      <span className="rounded-full bg-primary/[0.12] px-2.5 py-0.5 text-[9px] font-normal uppercase tracking-[0.14em] text-primary backdrop-blur-md sm:text-[10px]">
                        WorldStreet Original
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
                      className="text-balance text-[1.625rem] font-semibold leading-[1.12] tracking-tight text-white/95 sm:text-5xl md:text-6xl"
                      style={{ overflowWrap: "anywhere" }}
                    >
                      {title.title}
                    </h1>
                  </div>

                  {title.tagline ? (
                    <p className="mt-1 max-w-none text-pretty text-sm font-normal leading-relaxed text-white/75 sm:mt-1.5 sm:text-lg md:text-xl">
                      {title.tagline}
                    </p>
                  ) : null}
                </div>
              </motion.div>

              {/* Desktop: full action row */}
              <motion.div
                variants={flowItem}
                className="mt-4 hidden flex-wrap items-center gap-2 md:flex md:gap-2.5"
              >
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
                <button type="button" className={glassBtn} onClick={() => setCreditsOpen(true)} data-testid="title-open-credits">
                  <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4" />
                  Synopsis & credits
                </button>
              </motion.div>

              {/* Mobile: primary + More popover */}
              <motion.div variants={flowItem} className="mt-2 flex shrink-0 items-center gap-2 md:hidden">
                {mainHref ? (
                  <Link href={mainHref} data-testid="title-play-mobile" className={`${playBtnPrimary} shrink-0`}>
                    <HugeiconsIcon icon={PlayIcon} strokeWidth={2.25} className="size-4" />
                    {resumeProgressSeconds > 5 ? "Resume" : title.kind === "series" ? "Play S1 · E1" : "Play"}
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-full bg-white/[0.035] px-[1.1rem] py-2.5 text-sm font-normal text-white/40 backdrop-blur-lg"
                  >
                    Coming soon
                  </button>
                )}
                <TitleActionsMorePopover
                  titleId={title._id}
                  trailerHref={trailerHref}
                  watchTogetherHref={watchTogetherHref}
                  onOpenCredits={() => setCreditsOpen(true)}
                />
              </motion.div>

              {related.length > 0 ? (
                <motion.div
                  variants={flowItem}
                  className="mt-3 min-h-0 min-w-0 max-w-full max-md:flex-shrink md:mt-10"
                >
                  <TitleHeroRelatedStrip related={related} />
                </motion.div>
              ) : null}
            </motion.div>
          </div>
        </div>
      </section>

      <Sheet open={creditsOpen} onOpenChange={setCreditsOpen}>
        <SheetContent
          side="right"
          className="gap-0 p-0 flex w-full max-w-lg flex-col border-border/60 bg-background sm:max-w-md"
        >
          <SheetHeader className="shrink-0 border-b border-border/50 px-6 py-5 pr-14 text-left">
            <SheetTitle>Synopsis & credits</SheetTitle>
          </SheetHeader>
          <div className="slim-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-6">
            <div>
              <h2 className="mb-2 text-xs font-normal uppercase tracking-[0.2em] text-muted-foreground/90">Overview</h2>
              <p className="text-pretty text-sm leading-relaxed text-foreground/88 md:text-[15px] md:leading-relaxed">
                {title.synopsis || "No synopsis provided."}
              </p>
            </div>
            <div className="mt-10 space-y-6 border-t border-border/40 pt-10">
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

function TitleActionsMorePopover({
  titleId,
  trailerHref,
  watchTogetherHref,
  onOpenCredits,
}: {
  titleId: string
  trailerHref: string | null
  watchTogetherHref: string | null
  onOpenCredits: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={<button type="button" className={heroIconCircleBtn} aria-label="More actions" />}
      >
        <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} className="size-5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={10}
        className={cn(
          "max-md:max-h-[min(70dvh,24rem)] max-md:gap-1 max-md:overflow-y-auto max-md:p-2 max-md:overscroll-contain",
          "w-[min(12.5rem,calc(100vw-1.5rem))] gap-0 rounded-xl bg-white/[0.08] p-1.5 text-white backdrop-blur-2xl",
        )}
      >
        <nav className="flex flex-col gap-0.5">
          {trailerHref ? (
            <Link href={trailerHref} className={heroMenuLink} prefetch>
              Watch trailer
            </Link>
          ) : null}
          {watchTogetherHref ? (
            <Link href={watchTogetherHref} className={heroMenuLink} prefetch data-testid="title-watch-together-more">
              <HugeiconsIcon icon={UserMultipleIcon} strokeWidth={2} className="size-4" />
              Watch together
            </Link>
          ) : null}
          <TitleListRow titleId={titleId} />
          <button
            type="button"
            className={cn(heroMenuLink, "w-full cursor-pointer border-0 bg-transparent text-left outline-none")}
            data-testid="title-open-credits-more"
            onClick={onOpenCredits}
          >
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="size-4 shrink-0" />
            Synopsis & credits
          </button>
        </nav>
      </PopoverContent>
    </Popover>
  )
}

function TitleListRow({ titleId }: { titleId: string }) {
  return (
    <div className="py-px">
      <TitleListButton
        titleId={titleId}
        className="h-auto min-h-10 w-full justify-start gap-2 rounded-lg border border-white/12 bg-transparent px-3 py-2 text-sm font-medium text-white/93 shadow-none hover:bg-white/[0.09] hover:text-white"
      />
    </div>
  )
}

function TitleHeroRelatedStrip({ related }: { related: CatalogTitle[] }) {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const refreshScroll = React.useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 8)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8)
  }, [])

  React.useEffect(() => {
    const el = trackRef.current
    if (!el) return
    refreshScroll()
    el.addEventListener("scroll", refreshScroll, { passive: true })
    window.addEventListener("resize", refreshScroll)
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            refreshScroll()
          })
        : null
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", refreshScroll)
      window.removeEventListener("resize", refreshScroll)
      ro?.disconnect()
    }
  }, [refreshScroll, related])

  function scrollByPage(direction: 1 | -1) {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.92), behavior: "smooth" })
  }

  return (
    <div>
      <div className="mb-1 flex min-h-[2.25rem] items-center justify-between gap-2 max-md:mb-0.5 md:mb-2">
        <p className="text-[10px] font-normal uppercase tracking-[0.22em] text-white/45 md:text-[11px]">
          More like this
        </p>
        <div className="hidden shrink-0 items-center gap-1 md:flex">
          {canScrollLeft ? (
            <Button
              type="button"
              variant="glass"
              size="icon-sm"
              aria-label="More like this: scroll left"
              onClick={() => scrollByPage(-1)}
              className="rounded-full border-white/15 bg-black/50 text-white shadow-md backdrop-blur-md hover:bg-black/60"
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2.5} className="size-4" />
            </Button>
          ) : null}
          {canScrollRight ? (
            <Button
              type="button"
              variant="glass"
              size="icon-sm"
              aria-label="More like this: scroll right"
              onClick={() => scrollByPage(1)}
              className="rounded-full border-white/15 bg-black/50 text-white shadow-md backdrop-blur-md hover:bg-black/60"
            >
              <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2.5} className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <div
        ref={trackRef}
        className={cn(
          "scrollbar-none flex w-full max-w-full min-w-0 gap-2 overflow-x-auto overflow-y-hidden pb-0 [-ms-overflow-style:none] [scrollbar-width:none]",
          "max-md:snap-x max-md:snap-proximity md:gap-5 md:overscroll-x-contain md:pb-1 [&::-webkit-scrollbar]:hidden md:snap-x md:snap-mandatory",
        )}
      >
        {related.map((item) => (
          <MiniRelatedCard key={item._id} item={item} />
        ))}
      </div>
    </div>
  )
}

function MiniRelatedCard({ item }: { item: CatalogTitle }) {
  const href = item.mainAssetId ? `/watch/${item.mainAssetId}` : `/title/${item.slug}`
  const art = item.posterUrl || item.backdropUrl
  return (
    <Link
      href={href}
      prefetch
      className="group flex w-[86px] shrink-0 snap-start flex-col sm:w-[100px] md:w-[118px] lg:w-[128px]"
      data-testid="title-related-card"
      aria-label={item.title}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg shadow-[0_18px_40px_-16px_rgba(0,0,0,0.75)] ring-1 ring-white/10 transition-transform duration-500 ease-out group-hover:scale-[1.035] md:rounded-xl">
        {art ? (
          <Image
            src={art}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 640px) 86px, (max-width: 1024px) 118px, 128px"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/35 max-md:text-[10px]">WS</div>
        )}
      </div>
      {/* Poster carries the name — caption kept for assistive tech only. */}
      <span className="sr-only">{item.title}</span>
    </Link>
  )
}
