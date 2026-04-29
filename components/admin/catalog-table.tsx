"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"

import { cn, formatDuration, relativeTime } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import type { CatalogTitle } from "@/lib/catalog/types"

const STATUS_VARIANT: Record<CatalogTitle["status"], React.ComponentProps<typeof Badge>["variant"]> = {
  draft: "muted",
  scheduled: "outline",
  published: "new",
  archived: "destructive",
}

export function CatalogTable({ titles }: { titles: CatalogTitle[] }) {
  const [query, setQuery] = React.useState("")
  const filtered = React.useMemo(() => {
    if (!query.trim()) return titles
    const q = query.toLowerCase()
    return titles.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.genres.some((g) => g.toLowerCase().includes(q)),
    )
  }, [titles, query])

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Filter by title, slug, or genre"
        className="max-w-sm"
      />
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <table className="min-w-full divide-y divide-border/60 text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Title</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Genres</th>
              <th className="px-4 py-2 text-left">Duration</th>
              <th className="px-4 py-2 text-left">Updated</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No titles match this search.
                </td>
              </tr>
            ) : (
              filtered.map((title) => (
                <tr key={title._id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                        {title.posterUrl ? (
                          <Image
                            src={title.posterUrl}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="48px"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/admin/catalog/${title._id}`}
                          className="block truncate font-medium hover:underline"
                        >
                          {title.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{title.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[title.status]}>{title.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {title.genres.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span className="line-clamp-1">{title.genres.join(", ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {title.durationSeconds > 0 ? formatDuration(title.durationSeconds) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {title.updatedAt ? relativeTime(title.updatedAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/catalog/${title._id}`}
                      className={cn(
                        "rounded-md border border-border/60 px-2 py-1 text-xs",
                        "hover:bg-accent hover:text-foreground",
                      )}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
