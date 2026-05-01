"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "motion/react"

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

export function TitleRail({
  label,
  titles,
  href,
  emptyState,
  progressByTitleId,
  ranked = false,
}: TitleRailProps) {
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
      className={cn("relative px-4 py-3 md:px-12 md:py-4")}
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
        <motion.div
          className={cn(
            "scrollbar-none flex snap-x gap-4 overflow-x-auto pb-3 md:gap-5",
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
                "snap-start shrink-0",
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
