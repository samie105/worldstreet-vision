import Link from "next/link"

import { connectDB } from "@/lib/db/mongodb"
import { getAuthUser } from "@/lib/auth/clerk"
import VisionTitle from "@/models/VisionTitle"
import VisionProfile from "@/models/VisionProfile"
import { serializeTitle } from "@/lib/catalog/serializers"
import { fetchProfile } from "@/lib/actions/profile"
import { listTitles } from "@/lib/catalog/queries"
import { getMockTitleById } from "@/lib/catalog/mock-data"
import { TitleCard } from "@/components/catalog/title-card"
import type { CatalogTitle } from "@/lib/catalog/types"

export const dynamic = "force-dynamic"

export default async function MyListPage() {
  const user = await getAuthUser()
  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-muted-foreground">
        Sign in to build your watch list.
      </div>
    )
  }

  let titles: CatalogTitle[] = []

  try {
    await connectDB()
    const profile = await VisionProfile.findOne({ authUserId: user.userId })
    const titleIdsOrdered = profile?.myList ?? []
    const mongoIds = titleIdsOrdered.filter((id) => /^[a-f0-9]{24}$/i.test(id))
    const mockOnlyIds = titleIdsOrdered.filter((id) => !/^[a-f0-9]{24}$/i.test(id))

    const fromMongo =
      mongoIds.length > 0
        ? await VisionTitle.find({ _id: { $in: mongoIds }, status: "published" })
        : []
    const mongoById = new Map(fromMongo.map((doc) => [String(doc._id), serializeTitle(doc)]))
    const merged = new Map<string, CatalogTitle>()
    for (const id of titleIdsOrdered) {
      const fromDb = mongoById.get(id)
      if (fromDb) {
        merged.set(id, fromDb)
        continue
      }
      const mock = getMockTitleById(id)
      if (mock) merged.set(id, mock)
    }
    titles = titleIdsOrdered.map((id) => merged.get(id)).filter((t): t is CatalogTitle => !!t)
  } catch {
    // fall through to dev fallback
  }

  if (titles.length === 0) {
    const result = await fetchProfile()
    if (result.success && result.profile?.myList?.length) {
      const found: CatalogTitle[] = []
      for (const id of result.profile.myList) {
        const mock = getMockTitleById(id)
        if (mock) found.push(mock)
      }
      titles = found
    }
  }

  if (titles.length === 0) {
    titles = (await listTitles({ limit: 4 })).slice(0, 4)
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 pt-6 md:px-12">
      <header className="mb-5">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Yours</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">My List</h1>
      </header>
      {titles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/60 px-4 py-16 text-center text-sm text-muted-foreground">
          Save titles you want to watch later.
          <div className="mt-3">
            <Link
              href="/browse"
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              Browse the library
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 sm:grid-cols-4 sm:gap-x-3 sm:gap-y-5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {titles.map((title) => (
            <TitleCard key={title._id} title={title} />
          ))}
        </div>
      )}
    </div>
  )
}
