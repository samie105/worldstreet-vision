"use client"

import * as React from "react"
import { useQueryState } from "nuqs"
import { motion, AnimatePresence } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"

import { Input } from "@/components/ui/input"
import { searchTitles } from "@/lib/actions/catalog-search"
import { TitleCard } from "@/components/catalog/title-card"
import type { CatalogTitle } from "@/lib/catalog/types"

interface SearchInputProps {
  initialQuery?: string
  initialGenre?: string
  initialResults?: CatalogTitle[]
}

const SUGGESTED_GENRES = [
  "Thriller",
  "Finance",
  "Drama",
  "Series",
  "Documentary",
  "Action",
  "Mystery",
  "Sci-Fi",
]

export function SearchInput({
  initialQuery = "",
  initialGenre = "",
  initialResults = [],
}: SearchInputProps) {
  const [query, setQuery] = useQueryState("q", { defaultValue: initialQuery, history: "replace" })
  const [genre, setGenre] = useQueryState("genre", {
    defaultValue: initialGenre,
    history: "replace",
  })
  const [results, setResults] = React.useState<CatalogTitle[]>(initialResults)
  const [loading, setLoading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const tokenRef = React.useRef(0)

  React.useEffect(() => {
    inputRef.current?.focus()
  }, [])

  React.useEffect(() => {
    const trimmed = (query ?? "").trim()
    const token = ++tokenRef.current
    if (!trimmed && !genre) {
      const id = window.setTimeout(() => {
        if (token !== tokenRef.current) return
        setResults([])
        setLoading(false)
      }, 0)
      return () => window.clearTimeout(id)
    }
    const startId = window.setTimeout(() => setLoading(true), 0)
    const fetchId = window.setTimeout(async () => {
      try {
        const data = await searchTitles({ q: trimmed, genre: genre || undefined, limit: 60 })
        if (token !== tokenRef.current) return
        setResults(data.titles)
      } finally {
        if (token === tokenRef.current) setLoading(false)
      }
    }, 200)
    return () => {
      window.clearTimeout(startId)
      window.clearTimeout(fetchId)
    }
  }, [query, genre])

  return (
    <div className="flex flex-col gap-4" data-testid="search-page">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="relative max-w-xl"
      >
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
        />
        <Input
          ref={inputRef}
          value={query ?? ""}
          onChange={(event) => setQuery(event.target.value || null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery(null)
          }}
          placeholder="Search titles, genres, cast, directors"
          className="h-11 pl-9 pr-10 text-base"
          aria-label="Search Vision"
          data-testid="search-input"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery(null)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
          </button>
        ) : null}
      </form>

      <motion.div layout className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setGenre(null)}
          className={
            !genre
              ? "rounded-full border border-foreground bg-foreground px-3 py-1 text-xs font-semibold text-background"
              : "rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent"
          }
        >
          All genres
        </button>
        {SUGGESTED_GENRES.map((value) => {
          const active = genre?.toLowerCase() === value.toLowerCase()
          return (
            <motion.button
              key={value}
              onClick={() => setGenre(active ? null : value)}
              whileTap={{ scale: 0.95 }}
              className={
                active
                  ? "rounded-full border border-foreground bg-foreground px-3 py-1 text-xs font-semibold text-background"
                  : "rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-accent"
              }
            >
              {value}
            </motion.button>
          )
        })}
      </motion.div>

      <motion.div layout className="flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Looking through the catalog…</p>
        ) : null}

        {!loading && (query ?? "").trim().length === 0 && !genre ? (
          <p className="text-sm text-muted-foreground" data-testid="search-empty-prompt">
            Start typing above to find titles by name, cast, or genre.
          </p>
        ) : null}

        {!loading && results.length === 0 && ((query ?? "").trim().length > 0 || genre) ? (
          <div
            className="rounded-xl border border-dashed border-border/60 bg-card/60 px-4 py-16 text-center text-sm text-muted-foreground"
            data-testid="search-no-results"
          >
            Nothing matched <strong>“{(query ?? "").trim() || genre}”</strong>. Try a director or
            theme.
          </div>
        ) : null}

        <motion.div
          layout
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-6 md:gap-7 lg:grid-cols-2 xl:grid-cols-3"
        >
          <AnimatePresence initial={false}>
            {results.map((title) => (
              <motion.div
                key={title._id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <TitleCard title={title} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}
