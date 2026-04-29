"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon, Cancel01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { searchTitles } from "@/lib/actions/catalog-search"
import type { CatalogTitle } from "@/lib/catalog/types"

interface SearchPaletteProps {
  className?: string
}

const SUGGESTED_GENRES = ["Thriller", "Finance", "Drama", "Series", "Documentary", "Action"]

export function SearchPalette({ className }: SearchPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [results, setResults] = React.useState<CatalogTitle[]>([])
  const inputRef = React.useRef<HTMLInputElement>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const tokenRef = React.useRef(0)

  React.useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
        inputRef.current?.focus()
      }
      if (event.key === "Escape" && open) {
        setOpen(false)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    const token = ++tokenRef.current
    if (!trimmed) {
      const clearId = window.setTimeout(() => {
        if (token !== tokenRef.current) return
        setResults([])
        setLoading(false)
      }, 0)
      return () => window.clearTimeout(clearId)
    }
    const startId = window.setTimeout(() => setLoading(true), 0)
    const fetchId = window.setTimeout(async () => {
      try {
        const data = await searchTitles({ q: trimmed, limit: 8 })
        if (token !== tokenRef.current) return
        setResults(data.titles)
      } finally {
        if (token === tokenRef.current) setLoading(false)
      }
    }, 220)
    return () => {
      window.clearTimeout(startId)
      window.clearTimeout(fetchId)
    }
  }, [query, open])

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    setOpen(false)
    router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      data-testid="search-palette"
    >
      <form onSubmit={onSubmit} className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search titles, genres, cast"
          className="h-9 w-56 pl-8 pr-9 md:w-72"
          aria-label="Search Vision"
          data-testid="search-palette-input"
        />
        {query.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              setQuery("")
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3.5" />
          </button>
        ) : null}
      </form>

      <AnimatePresence>
        {open ? (
          <motion.div
            layout
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(92vw,520px)] overflow-hidden rounded-xl border border-border/40 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-2xl"
            data-testid="search-results"
          >
            <motion.div layout className="border-b border-border/40 px-3 py-2 text-xs text-muted-foreground">
              {query.trim().length === 0
                ? "Start typing — results update as you press keys."
                : loading
                  ? "Looking through the catalog…"
                  : `${results.length} result${results.length === 1 ? "" : "s"} for "${query.trim()}"`}
            </motion.div>

            {query.trim().length === 0 ? (
              <motion.div layout className="p-3">
                <p className="px-1 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  Browse genres
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_GENRES.map((genre) => (
                    <Link
                      key={genre}
                      href={`/browse?genre=${encodeURIComponent(genre)}`}
                      onClick={() => setOpen(false)}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-accent"
                    >
                      {genre}
                    </Link>
                  ))}
                </div>
              </motion.div>
            ) : results.length === 0 && !loading ? (
              <motion.div layout className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing matched <span className="font-medium text-foreground">{query.trim()}</span>.
                Try a director, cast, or theme.
              </motion.div>
            ) : (
              <motion.ul layout className="max-h-[60vh] overflow-y-auto py-1.5 slim-scroll">
                <AnimatePresence initial={false}>
                  {results.map((title) => (
                    <motion.li
                      key={title._id}
                      layout
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                    >
                      <Link
                        href={`/title/${title.slug}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50"
                      >
                        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                          {title.backdropUrl ? (
                            <Image
                              src={title.backdropUrl}
                              alt=""
                              fill
                              sizes="80px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-tight">{title.title}</p>
                          <p className="line-clamp-1 text-[11px] text-muted-foreground">
                            {title.genres.slice(0, 3).join(" · ")} · {title.releaseYear}
                          </p>
                        </div>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          strokeWidth={2}
                          className="size-3.5 text-muted-foreground"
                        />
                      </Link>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}

            {query.trim().length > 0 ? (
              <button
                onClick={onSubmit as unknown as () => void}
                className="w-full border-t border-border/40 bg-card/50 px-4 py-2 text-left text-[12px] font-medium text-foreground hover:bg-accent/50"
              >
                See all results for &ldquo;{query.trim()}&rdquo; →
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
