import { listTitles } from "@/lib/catalog/queries"
import { TitleCard } from "@/components/catalog/title-card"

interface BrowsePageProps {
  searchParams: Promise<{ genre?: string }>
}

export const dynamic = "force-dynamic"

export default async function BrowsePage({ searchParams }: BrowsePageProps) {
  const { genre } = await searchParams
  const titles = await listTitles({ genre, limit: 90 })
  const genres = await collectGenres()

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-12" data-testid="browse-page">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Browse</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            {genre ? `${genre} titles` : "All titles"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <a
            href="/browse"
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              !genre ? "bg-foreground text-background" : "border border-border hover:bg-accent"
            }`}
          >
            All
          </a>
          {genres.slice(0, 12).map((g) => (
            <a
              key={g}
              href={`/browse?genre=${encodeURIComponent(g)}`}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                genre === g ? "bg-foreground text-background" : "border border-border hover:bg-accent"
              }`}
            >
              {g}
            </a>
          ))}
        </div>
      </header>

      {titles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/60 px-4 py-16 text-center text-sm text-muted-foreground">
          Nothing here yet. Try another genre.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {titles.map((title) => (
            <TitleCard key={title._id} title={title} />
          ))}
        </div>
      )}
    </div>
  )
}

async function collectGenres(): Promise<string[]> {
  const titles = await listTitles({ limit: 120 })
  const set = new Set<string>()
  for (const title of titles) {
    for (const genre of title.genres) {
      if (genre) set.add(genre)
    }
  }
  return Array.from(set).sort()
}
