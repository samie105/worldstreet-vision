"use server"

import { listTitles } from "@/lib/catalog/queries"
import type { CatalogTitle } from "@/lib/catalog/types"

interface SearchResult {
  query: string
  titles: CatalogTitle[]
}

export async function searchTitles(input: {
  q: string
  limit?: number
  genre?: string
}): Promise<SearchResult> {
  const query = (input.q ?? "").trim()
  if (query.length === 0 && !input.genre) {
    return { query, titles: [] }
  }
  const titles = await listTitles({
    search: query || undefined,
    genre: input.genre || undefined,
    limit: input.limit ?? 24,
  })
  return { query, titles }
}
