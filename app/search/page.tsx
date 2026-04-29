import { Suspense } from "react"

import { listTitles } from "@/lib/catalog/queries"
import { SearchInput } from "@/components/catalog/search-input"

interface SearchPageProps {
  searchParams: Promise<{ q?: string; genre?: string }>
}

export const dynamic = "force-dynamic"

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams
  const initialResults = await listTitles({
    search: params.q || undefined,
    genre: params.genre || undefined,
    limit: 60,
  })

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-12">
      <header className="mb-5 flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Search</p>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Find your next obsession
        </h1>
      </header>
      <Suspense>
        <SearchInput
          initialQuery={params.q}
          initialGenre={params.genre}
          initialResults={initialResults}
        />
      </Suspense>
    </div>
  )
}
