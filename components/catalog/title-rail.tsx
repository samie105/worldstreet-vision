"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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

export function TitleRail({
  label,
  titles,
  href,
  emptyState,
  progressByTitleId,
  ranked = false,
}: TitleRailProps) {
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
    return () => {
      el.removeEventListener("scroll", refreshScroll)
      window.removeEventListener("resize", refreshScroll)
    }
  }, [refreshScroll])

  const scrollByPage = (direction: 1 | -1) => {
    const el = trackRef.current
    if (!el) return
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.92), behavior: "smooth" })
  }

  if (titles.length === 0 && emptyState) {
    return (
      <section className="px-4 py-4 md:px-12">
        <header className="mb-3 flex items-end justify-between gap-2">
          <h3 className="text-base font-semibold tracking-tight md:text-lg">{label}</h3>
          {href ? (
            <Link href={href} className="text-xs text-muted-foreground hover:text-foreground">
              See all
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
      className={cn("group/rail relative px-4 py-3 md:px-12 md:py-4")}
      data-testid="title-rail"
      data-label={label}
    >
      <header className="mb-2.5 flex items-end justify-between gap-2 md:mb-3">
        <h3 className="text-base font-semibold tracking-tight md:text-lg">{label}</h3>
        {href ? (
          <Link
            href={href}
            className="hidden text-xs text-muted-foreground hover:text-foreground md:inline"
          >
            See all
          </Link>
        ) : null}
      </header>

      <div className="relative">
        {canScrollLeft ? (
          <Button
            variant="glass"
            size="icon-lg"
            aria-label={`Scroll ${label} left`}
            onClick={() => scrollByPage(-1)}
            className="absolute left-0 top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 md:inline-flex"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2.5} />
          </Button>
        ) : null}
        {canScrollRight ? (
          <Button
            variant="glass"
            size="icon-lg"
            aria-label={`Scroll ${label} right`}
            onClick={() => scrollByPage(1)}
            className="absolute right-0 top-1/2 z-20 hidden translate-x-1/2 -translate-y-1/2 rounded-full bg-black/55 text-white opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 md:inline-flex"
          >
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2.5} />
          </Button>
        ) : null}

        <motion.div
          ref={trackRef}
          className={cn(
            "scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 md:gap-5",
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
                "snap-start shrink-0",
                // Prioritize readability: ~3/4 viewport on phones, progressively fewer tiles on wide screens
                "w-[75%] sm:w-[58%] md:w-[46%] lg:w-[38%] xl:w-[32%] 2xl:w-[28%]",
              )}
            >
              <TitleCard
                title={title}
                progress={progressByTitleId?.[title._id]}
                rank={ranked ? index + 1 : undefined}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
