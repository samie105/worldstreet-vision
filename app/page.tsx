import { Suspense } from "react"

import { getAuthUser } from "@/lib/auth/clerk"
import {
  buildHomeRails,
  listContinueWatching,
  listTitles,
} from "@/lib/catalog/queries"
import { Hero } from "@/components/catalog/hero"
import { TitleRail } from "@/components/catalog/title-rail"
import { Skeleton } from "@/components/ui/skeleton"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <Home />
    </Suspense>
  )
}

async function Home() {
  const user = await getAuthUser()
  const featured = await listTitles({ limit: 1 })
  const hero = featured[0] ?? null
  const [rails, continueItems] = await Promise.all([
    buildHomeRails(user?.userId ?? null),
    user?.userId ? listContinueWatching(user.userId) : Promise.resolve([]),
  ])

  const progressByTitleId: Record<string, number | undefined> = {}
  for (const item of continueItems) {
    if (item.durationSeconds > 0) {
      progressByTitleId[item.title._id] = item.positionSeconds / item.durationSeconds
    }
  }

  const heroResume = hero
    ? continueItems.find((item) => item.title._id === hero._id)?.positionSeconds ?? 0
    : 0

  return (
    <div className="flex flex-col gap-2 md:gap-3">
      {hero ? (
        <Hero title={hero} resumeSeconds={heroResume} variant="billboard" />
      ) : (
        <HomeEmptyState />
      )}

      {continueItems.length > 0 ? (
        <TitleRail
          label="Continue watching"
          titles={continueItems.map((c) => c.title)}
          progressByTitleId={progressByTitleId}
        />
      ) : null}

      {rails.map(({ rail, titles }, index) => (
        <TitleRail
          key={rail._id}
          label={rail.label}
          titles={titles}
          ranked={rail.kind === "trending" && index === 1}
          emptyState={
            rail.kind === "continue"
              ? "Start watching something to see it here next time."
              : "No titles in this rail yet."
          }
        />
      ))}
    </div>
  )
}

function HomeEmptyState() {
  return (
    <section className="vision-stage relative -mt-14 flex h-[60vh] min-h-[420px] flex-col items-center justify-center gap-3 px-6 text-center md:-mt-16">
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        WorldStreet Vision
      </p>
      <h1 className="max-w-2xl text-3xl font-semibold md:text-5xl">
        Your library is taking shape.
      </h1>
      <p className="max-w-xl text-sm text-muted-foreground md:text-base">
        Add titles in the admin catalog to bring this home page to life.
      </p>
    </section>
  )
}

function HomeSkeleton() {
  return (
    <div className="space-y-6 px-4 pt-20 md:px-12">
      <Skeleton className="h-[60vh] w-full rounded-2xl" />
      {Array.from({ length: 3 }).map((_, idx) => (
        <div key={idx} className="space-y-3">
          <Skeleton className="h-5 w-44" />
          <div className="flex gap-3">
            {Array.from({ length: 8 }).map((_, j) => (
              <Skeleton key={j} className="aspect-[2/3] w-[14%] shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
