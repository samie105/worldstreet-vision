import type { IVisionAsset } from "@/models/VisionAsset"
import type { IVisionRail } from "@/models/VisionRail"
import type { IVisionTitle } from "@/models/VisionTitle"

import type { CatalogAsset, CatalogRail, CatalogTitle, TitleBadge } from "./types"

export function serializeTitle(doc: IVisionTitle): CatalogTitle {
  const obj = (doc.toObject ? doc.toObject() : (doc as unknown)) as Record<string, unknown>
  const seriesGenre =
    Array.isArray(obj.genres) && obj.genres.some((g) => String(g).toLowerCase() === "series")
  return {
    _id: String(obj._id),
    slug: String(obj.slug),
    title: String(obj.title),
    tagline: String(obj.tagline ?? ""),
    synopsis: String(obj.synopsis ?? ""),
    genres: arr(obj.genres),
    tags: arr(obj.tags),
    cast: arr(obj.cast),
    director: String(obj.director ?? ""),
    releaseYear: num(obj.releaseYear),
    durationSeconds: num(obj.durationSeconds),
    maturityRating: (obj.maturityRating ?? "pg13") as CatalogTitle["maturityRating"],
    status: (obj.status ?? "draft") as CatalogTitle["status"],
    publishAt: dateOrNull(obj.publishAt),
    posterUrl: String(obj.posterUrl ?? ""),
    backdropUrl: String(obj.backdropUrl ?? ""),
    trailerAssetId: nullable(obj.trailerAssetId),
    mainAssetId: nullable(obj.mainAssetId),
    collectionSlug: nullable(obj.collectionSlug),
    episodeNumber: numNullable(obj.episodeNumber),
    seasonNumber: numNullable(obj.seasonNumber),
    weight: num(obj.weight),
    createdAt: dateString(obj.createdAt),
    updatedAt: dateString(obj.updatedAt),
    kind: seriesGenre ? "series" : "movie",
    previewClipUrl: nullable(obj.previewClipUrl),
    badge: nullable(obj.badge) as TitleBadge | null,
    logoText: String(obj.logoText ?? obj.title ?? ""),
    seasons: undefined,
  }
}

export function serializeAsset(doc: IVisionAsset): CatalogAsset {
  const obj = (doc.toObject ? doc.toObject() : (doc as unknown)) as Record<string, unknown>
  return {
    _id: String(obj._id),
    externalId: String(obj.externalId),
    titleId: nullable(obj.titleId),
    kind: (obj.kind ?? "feature") as CatalogAsset["kind"],
    status: (obj.status ?? "uploading") as CatalogAsset["status"],
    errorMessage: String(obj.errorMessage ?? ""),
    cloudflareVideoUid: nullable(obj.cloudflareVideoUid),
    signed: Boolean(obj.signed ?? true),
    durationSeconds: num(obj.durationSeconds),
    aspectRatio: String(obj.aspectRatio ?? "16:9"),
    posterTimeSeconds: num(obj.posterTimeSeconds),
    captions: Array.isArray(obj.captions)
      ? (obj.captions as { language: string; label: string; url: string }[])
      : [],
    uploadedBy: String(obj.uploadedBy ?? ""),
    createdAt: dateString(obj.createdAt),
    updatedAt: dateString(obj.updatedAt),
  }
}

export function serializeRail(doc: IVisionRail): CatalogRail {
  const obj = (doc.toObject ? doc.toObject() : (doc as unknown)) as Record<string, unknown>
  return {
    _id: String(obj._id),
    slug: String(obj.slug),
    label: String(obj.label),
    kind: (obj.kind ?? "manual") as CatalogRail["kind"],
    position: num(obj.position),
    isActive: Boolean(obj.isActive ?? true),
    manualSlugs: arr(obj.manualSlugs),
    genreFilter: nullable(obj.genreFilter),
  }
}

function arr(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : []
}

function num(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string" && !Number.isNaN(Number(value))) return Number(value)
  return 0
}

function numNullable(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return value
  return null
}

function nullable(value: unknown): string | null {
  if (value === null || value === undefined) return null
  return String(value)
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value
  return ""
}

function dateOrNull(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value
  return null
}
