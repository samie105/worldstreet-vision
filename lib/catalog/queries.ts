import "server-only"

import { connectDB } from "@/lib/db/mongodb"
import VisionAsset from "@/models/VisionAsset"
import VisionRail from "@/models/VisionRail"
import VisionTitle from "@/models/VisionTitle"
import VisionWatchProgress from "@/models/VisionWatchProgress"

import {
  serializeAsset,
  serializeRail,
  serializeTitle,
} from "./serializers"
import type {
  CatalogAsset,
  CatalogRail,
  CatalogTitle,
  ContinueWatchingItem,
  RailWithTitles,
} from "./types"
import {
  buildMockRails,
  filterMockTitles,
  getMockAssetById,
  getMockAssetsForTitle,
  getMockTitleById,
  getMockTitleBySlug,
  MOCK_TITLES,
} from "./mock-data"

interface ListTitlesOptions {
  status?: CatalogTitle["status"] | CatalogTitle["status"][]
  genre?: string
  search?: string
  limit?: number
  skip?: number
}

export async function listTitles(options: ListTitlesOptions = {}): Promise<CatalogTitle[]> {
  try {
    await connectDB()
  } catch {
    return filterMockTitles(options)
  }
  const filter: Record<string, unknown> = {}
  if (options.status) {
    filter.status = Array.isArray(options.status)
      ? { $in: options.status }
      : options.status
  } else {
    filter.status = "published"
  }
  if (options.genre) filter.genres = options.genre
  if (options.search) {
    const safe = options.search.trim().slice(0, 80)
    if (safe.length > 0) {
      filter.$text = { $search: safe }
    }
  }

  const docs = await VisionTitle.find(filter)
    .sort({ weight: -1, publishAt: -1, createdAt: -1 })
    .skip(options.skip ?? 0)
    .limit(Math.min(options.limit ?? 60, 120))
  const titles = docs.map(serializeTitle)
  return titles.length > 0 ? titles : filterMockTitles(options)
}

/** Titles that share genres with the current title, excluding it, for detail rails. */
export async function listRelatedTitles(
  excludeSlug: string,
  genres: string[],
  limit = 14,
): Promise<CatalogTitle[]> {
  const pool = await listTitles({ limit: 96 })
  const ex = excludeSlug.trim().toLowerCase()
  const genreSet = new Set(genres)
  const scored = pool
    .filter((t) => t.slug.toLowerCase() !== ex)
    .map((t) => ({
      t,
      score: t.genres.reduce((n, g) => n + (genreSet.has(g) ? 1 : 0), 0),
    }))
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return b.t.weight - a.t.weight
  })
  return scored.slice(0, limit).map((s) => s.t)
}

export async function getTitleBySlug(slug: string): Promise<CatalogTitle | null> {
  const mock = getMockTitleBySlug(slug)
  try {
    await connectDB()
  } catch {
    return mock
  }
  const doc = await VisionTitle.findOne({ slug: slug.toLowerCase() })
  return doc ? serializeTitle(doc) : mock
}

export async function getTitleById(id: string): Promise<CatalogTitle | null> {
  const mock = getMockTitleById(id)
  // Mock IDs ("demo-title-01") aren't ObjectIds — short-circuit before Mongoose
  // throws a cast error.
  if (!safeObjectId(id)) return mock
  try {
    await connectDB()
  } catch {
    return mock
  }
  const doc = await VisionTitle.findById(id)
  return doc ? serializeTitle(doc) : mock
}

export async function getAssetById(id: string): Promise<CatalogAsset | null> {
  const mock = getMockAssetById(id)
  if (mock) return mock
  try {
    await connectDB()
  } catch {
    return null
  }
  const objectId = safeObjectId(id)
  const clauses: Record<string, unknown>[] = [{ externalId: id }]
  if (objectId) clauses.push({ _id: objectId })
  const doc = await VisionAsset.findOne({ $or: clauses })
  return doc ? serializeAsset(doc) : null
}

export async function getAssetsForTitle(titleId: string): Promise<CatalogAsset[]> {
  const mock = getMockAssetsForTitle(titleId)
  if (mock.length > 0) return mock
  try {
    await connectDB()
  } catch {
    return []
  }
  const docs = await VisionAsset.find({ titleId }).sort({ kind: 1, createdAt: 1 })
  return docs.map(serializeAsset)
}

export async function listActiveRails(): Promise<CatalogRail[]> {
  try {
    await connectDB()
  } catch {
    return buildMockRails().map(({ rail }) => rail)
  }
  const docs = await VisionRail.find({ isActive: true }).sort({ position: 1 })
  const rails = docs.map(serializeRail)
  return rails.length > 0 ? rails : buildMockRails().map(({ rail }) => rail)
}

export async function buildHomeRails(authUserId: string | null): Promise<RailWithTitles[]> {
  try {
    await connectDB()
  } catch {
    return buildMockRails()
  }
  const rails = await listActiveRails()
  if (rails.every((rail) => rail._id.startsWith("demo-rail-"))) return buildMockRails()

  return Promise.all(
    rails.map(async (rail) => {
      let titles: CatalogTitle[] = []
      switch (rail.kind) {
        case "manual": {
          if (rail.manualSlugs.length > 0) {
            const docs = await VisionTitle.find({
              slug: { $in: rail.manualSlugs },
              status: "published",
            })
            const ordered: CatalogTitle[] = []
            const map = new Map(docs.map((d) => [d.slug, serializeTitle(d)]))
            for (const slug of rail.manualSlugs) {
              const t = map.get(slug.toLowerCase())
              if (t) ordered.push(t)
            }
            titles = ordered
          }
          break
        }
        case "trending":
          titles = await listTitles({ limit: 18 })
          break
        case "newest": {
          await connectDB()
          const docs = await VisionTitle.find({ status: "published" })
            .sort({ publishAt: -1, createdAt: -1 })
            .limit(18)
          titles = docs.map(serializeTitle)
          break
        }
        case "genre":
          if (rail.genreFilter) {
            titles = await listTitles({ genre: rail.genreFilter, limit: 18 })
          }
          break
        case "continue":
          if (authUserId) {
            const items = await listContinueWatching(authUserId, 18)
            titles = items.map((i) => i.title)
          }
          break
      }
      return { rail, titles }
    }),
  )
}

export async function listContinueWatching(
  authUserId: string,
  limit = 12,
): Promise<ContinueWatchingItem[]> {
  try {
    await connectDB()
  } catch {
    return mockContinueWatching(limit)
  }
  const progress = await VisionWatchProgress.find({
    authUserId,
    completed: false,
    positionSeconds: { $gt: 5 },
  })
    .sort({ lastWatchedAt: -1 })
    .limit(limit)

  if (progress.length === 0) return mockContinueWatching(limit)

  const titleIds = [...new Set(progress.map((p) => p.titleId))]
  const assetIds = [...new Set(progress.map((p) => p.assetId))]
  const mongoTitleIds = titleIds.filter((id) => safeObjectId(id))
  const mongoAssetIds = assetIds.filter((id) => safeObjectId(id))

  const [titleDocs, assetDocs] = await Promise.all([
    mongoTitleIds.length > 0 ? VisionTitle.find({ _id: { $in: mongoTitleIds } }) : [],
    mongoAssetIds.length > 0 ? VisionAsset.find({ _id: { $in: mongoAssetIds } }) : [],
  ])

  const titleMap = new Map<string, CatalogTitle>()
  for (const doc of titleDocs) {
    titleMap.set(String(doc._id), serializeTitle(doc))
  }
  for (const id of titleIds) {
    if (!titleMap.has(id)) {
      const mock = getMockTitleById(id)
      if (mock) titleMap.set(id, mock)
    }
  }

  const assetMap = new Map<string, CatalogAsset>()
  for (const doc of assetDocs) {
    assetMap.set(String(doc._id), serializeAsset(doc))
  }
  for (const id of assetIds) {
    if (!assetMap.has(id)) {
      const mock = getMockAssetById(id)
      if (mock) assetMap.set(id, mock)
    }
  }

  return progress
    .map((p) => {
      const title = titleMap.get(p.titleId)
      if (!title) return null
      return {
        title,
        asset: assetMap.get(p.assetId) ?? null,
        positionSeconds: p.positionSeconds,
        durationSeconds: p.durationSeconds,
        completed: p.completed,
        lastWatchedAt: p.lastWatchedAt.toISOString(),
      } satisfies ContinueWatchingItem
    })
    .filter((value): value is ContinueWatchingItem => value !== null)
}

function mockContinueWatching(limit: number): ContinueWatchingItem[] {
  return MOCK_TITLES.slice(2, 5).slice(0, limit).map((title, index) => ({
    title,
    asset: getMockAssetById(title.mainAssetId ?? "") ?? null,
    positionSeconds: [1180, 2440, 680][index] ?? 900,
    durationSeconds: title.durationSeconds,
    completed: false,
    lastWatchedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
  }))
}

function safeObjectId(value: string): string | null {
  return /^[a-f0-9]{24}$/i.test(value) ? value : null
}
