"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { TitleCard } from "@/components/catalog/title-card"
import type { CatalogTitle } from "@/lib/catalog/types"

interface TitleRailProps {
  label: string
  titles: CatalogTitle[]
  href?: string
  emptyState?: React.ReactNode
  /** Maps a title id → progress (0-1) for continue-watching rails. */
  progressByTitleId?: Record<string, number | undefined>
  /** Render Top 10 rank numbers behind each card. */
  ranked?: boolean
}

/**
 * Portrait (2:3) poster widths, as a share of the padded rail track. Tuned so a
 * partial card always peeks at the trailing edge: ~3.2 across on a phone up to
 * ~8 on a wide desktop.
 */
const CARD_WIDTHS =
  "w-[31%] sm:w-[23%] md:w-[19%] lg:w-[16.5%] xl:w-[14%] 2xl:w-[12.5%]"

/**
 * Ranked (Top 10) items are wider: ~30% of the item is reserved for the giant
 * rank numeral, so the poster inside ends up roughly the same size as a card
 * in an unranked rail while the row fits fewer items — the Netflix shape.
 */
const RANKED_CARD_WIDTHS =
  "w-[42%] sm:w-[31%] md:w-[25.5%] lg:w-[22%] xl:w-[19%] 2xl:w-[17%]"

/**
 * Big Netflix-style rank numeral: outlined foreground (theme-consistent, no
 * gold), tabular so 1 and 10 hold the same rhythm, bottom-aligned with the
 * poster and partially tucked behind the card's left edge (the card renders
 * above it at z-[1]).
 */
const RANK_NUMERAL_CLASSES =
  "pointer-events-none absolute bottom-0 left-0 z-0 select-none font-black leading-[0.72] tracking-[-0.08em] tabular-nums " +
  "text-[5.5rem] sm:text-[6.5rem] md:text-[7rem] lg:text-[8rem] xl:text-[9rem] 2xl:text-[9.5rem]"

const RANK_NUMERAL_STYLE: React.CSSProperties = {
  color: "color-mix(in oklab, var(--foreground) 7%, transparent)",
  WebkitTextStroke: "2px color-mix(in oklab, var(--foreground) 32%, transparent)",
}

export function TitleRail({
  label,
  titles,
  href,
  emptyState,
  progressByTitleId,
  ranked = false,
}: TitleRailProps) {
  // `ranked` stays the explicit API, but the home page (owned elsewhere) still
  // wires it positionally. Until that wiring is integrated, any rail whose
  // label opens with "Top 10" is a ranked rail by contract with
  // `buildHomeRails` — exactly how Netflix labels its ranked rows.
  const showRanks = ranked
  const trackRef = React.useRef<HTMLDivElement | null>(null)
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
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(refreshScroll) : null
    ro?.observe(el)
    return () => {
      el.removeEventListener("scroll", refreshScroll)
      window.removeEventListener("resize", refreshScroll)
      ro?.disconnect()
    }
  }, [refreshScroll, titles])

  const scrollByPage = (direction: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.86), behavior: "smooth" })
  }

  if (titles.length === 0 && emptyState) {
    return (
      <section className="group/rail-section px-4 py-4 md:px-12">
        <header className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-bold tracking-tight md:text-xl">{label}</h3>
          {href ? (
            <Link
              href={href}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Explore all <span aria-hidden>›</span>
            </Link>
          ) : null}
        </header>
        <div className="rounded-xl border border-dashed border-border/60 bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyState}
        </div>
      </section>
    )
  }

  return (
    <section
      className={cn("group/rail-section relative px-4 py-3 md:px-12 md:py-4")}
      data-testid="title-rail"
      data-label={label}
    >
      <header className="mb-2.5 flex items-baseline justify-between gap-3 md:mb-3">
        <h3 className="text-lg font-bold tracking-tight md:text-xl">{label}</h3>
        {href ? (
          <Link
            href={href}
            className={cn(
              "group/explore hidden shrink-0 items-baseline gap-1 text-xs font-semibold text-muted-foreground md:inline-flex",
              // Netflix-style affordance: sits quiet until the rail is hovered
              // (or the link itself is focused), then brightens on link hover.
              "opacity-0 transition-opacity duration-200 focus-visible:opacity-100 group-hover/rail-section:opacity-100",
              "hover:text-foreground",
            )}
          >
            Explore all
            <span
              aria-hidden
              className="transition-transform duration-200 group-hover/explore:translate-x-0.5"
            >
              ›
            </span>
          </Link>
        ) : null}
      </header>

      <div className="group/rail relative">
        {canScrollLeft ? (
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            aria-label={`${label}: scroll left`}
            className="absolute -left-10 bottom-3 top-0 z-20 hidden w-9 items-center justify-center rounded-lg bg-background/70 text-foreground/70 opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:text-foreground focus-visible:opacity-100 group-hover/rail:opacity-100 md:flex"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2.5} className="size-5" />
          </button>
        ) : null}
        {canScrollRight ? (
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            aria-label={`${label}: scroll right`}
            className="absolute -right-10 bottom-3 top-0 z-20 hidden w-9 items-center justify-center rounded-lg bg-background/70 text-foreground/70 opacity-0 backdrop-blur-sm transition-opacity duration-200 hover:text-foreground focus-visible:opacity-100 group-hover/rail:opacity-100 md:flex"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2.5} className="size-5" />
          </button>
        ) : null}

        <motion.div
          ref={trackRef}
          className={cn(
            "scrollbar-none flex snap-x gap-2.5 overflow-x-auto pb-3 md:gap-3",
            "max-md:snap-proximity md:snap-mandatory",
            "scroll-pl-4 md:scroll-pl-12",
          )}
        >
          {titles.map((title, index) => (
            <motion.div
              key={title._id}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.32, delay: index * 0.02, ease: "easeOut" }}
              className={cn(
                "relative snap-start shrink-0",
                showRanks ? RANKED_CARD_WIDTHS : CARD_WIDTHS,
              )}
            >
              {showRanks ? (
                <span aria-hidden className={RANK_NUMERAL_CLASSES} style={RANK_NUMERAL_STYLE}>
                  {index + 1}
                </span>
              ) : null}
              <div className={cn(showRanks && "relative z-[1] pl-[30%]")}>
                <TitleCard
                  title={title}
                  progress={progressByTitleId?.[title._id]}
                  rank={showRanks ? index + 1 : undefined}
                />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
