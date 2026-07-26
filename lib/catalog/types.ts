import type { VisionMaturityRating, VisionTitleStatus } from "@/models/VisionTitle"

export type TitleKind = "movie" | "series"

export interface SeriesEpisode {
  _id: string
  seasonNumber: number
  episodeNumber: number
  title: string
  synopsis: string
  durationSeconds: number
  posterUrl: string
  thumbnailUrl: string
  /** Asset id used by the watch route (`/watch/[assetId]`). */
  assetId: string
  cloudflareVideoUid: string | null
  demoPlaybackUrl?: string
}

export interface SeriesSeason {
  number: number
  label: string
  episodes: SeriesEpisode[]
}

export interface CatalogTitle {
  _id: string
  slug: string
  title: string
  tagline: string
  synopsis: string
  genres: string[]
  tags: string[]
  cast: string[]
  director: string
  releaseYear: number
  durationSeconds: number
  maturityRating: VisionMaturityRating
  status: VisionTitleStatus
  publishAt: string | null
  posterUrl: string
  backdropUrl: string
  trailerAssetId: string | null
  mainAssetId: string | null
  collectionSlug: string | null
  episodeNumber: number | null
  seasonNumber: number | null
  weight: number
  createdAt: string
  updatedAt: string
  /** TMDB movie id when the title has been enriched. Optional — mock data omits it. */
  tmdbId?: number | null
  /** Movie or multi-episode series. Defaults to "movie". */
  kind: TitleKind
  /** Short URL (HLS) used for hover-to-preview cards. */
  previewClipUrl: string | null
  /** Surface label rendered as a "New", "Recently Added", etc. badge. */
  badge: TitleBadge | null
  /** Marketing logo treatment used in heros and series cards. */
  logoText: string
  /** Populated on series detail responses only. */
  seasons?: SeriesSeason[]
}

export type TitleBadge =
  | "new-release"
  | "new-season"
  | "recently-added"
  | "leaving-soon"
  | "top10"
  | "exclusive"

export interface CatalogAsset {
  _id: string
  externalId: string
  titleId: string | null
  kind: "trailer" | "feature" | "preview" | "extra"
  status: "uploading" | "preparing" | "ready" | "errored"
  errorMessage: string
  cloudflareVideoUid: string | null
  demoPlaybackUrl?: string
  demoPosterUrl?: string
  signed: boolean
  durationSeconds: number
  aspectRatio: string
  posterTimeSeconds: number
  captions: { language: string; label: string; url: string }[]
  uploadedBy: string
  createdAt: string
  updatedAt: string
}

export interface CatalogRail {
  _id: string
  slug: string
  label: string
  kind: "manual" | "trending" | "newest" | "continue" | "genre"
  position: number
  isActive: boolean
  manualSlugs: string[]
  genreFilter: string | null
}

export interface RailWithTitles {
  rail: CatalogRail
  titles: CatalogTitle[]
}

export interface ContinueWatchingItem {
  title: CatalogTitle
  asset: CatalogAsset | null
  positionSeconds: number
  durationSeconds: number
  completed: boolean
  lastWatchedAt: string
}
