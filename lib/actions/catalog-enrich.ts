"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { requireAdminUser } from "@/lib/auth/clerk"
import { connectDB } from "@/lib/db/mongodb"
import VisionTitle from "@/models/VisionTitle"
import { serializeTitle } from "@/lib/catalog/serializers"
import type { CatalogTitle } from "@/lib/catalog/types"
import {
  getMovieCredits,
  getMovieDetails,
  getMovieReleaseDates,
  isTmdbConfigured,
  searchMovies,
  tmdbImageUrl,
  TMDB_NOT_CONFIGURED_MESSAGE,
  TmdbNotConfiguredError,
} from "@/lib/tmdb/client"
import {
  certificationToMaturityRating,
  ENRICHABLE_FIELDS,
  pickUsCertification,
  rankCandidates,
  type EnrichableField,
  type EnrichmentFields,
  type MatchConfidence,
} from "@/lib/tmdb/match"

export interface EnrichResult<T> {
  success: boolean
  data?: T
  error?: string
}

export interface TmdbCandidate {
  tmdbId: number
  title: string
  originalTitle: string
  year: number | null
  overview: string
  /** w185 thumbnail for the picker; "" when TMDB has no poster. */
  posterThumbUrl: string
  confidence: MatchConfidence
  /** Blended 0..1 match score — shown so admins can sanity-check the ranking. */
  score: number
  voteCount: number
}

export interface TmdbEnrichmentPreview {
  tmdbId: number
  incoming: EnrichmentFields
}

const MAX_CANDIDATES = 8

/**
 * Search TMDB for candidate matches for an existing catalog title.
 * Never applies anything — returns ranked candidates with confidence so the
 * admin can pick (low-confidence matches must always go through a human).
 */
export async function searchTmdbForTitle(
  titleId: string,
): Promise<EnrichResult<{ candidates: TmdbCandidate[]; query: string }>> {
  try {
    await requireAdminUser()
    if (!isTmdbConfigured()) return { success: false, error: TMDB_NOT_CONFIGURED_MESSAGE }

    const parsed = z.string().min(1).parse(titleId)
    await connectDB()
    const title = await VisionTitle.findById(parsed)
    if (!title) return { success: false, error: "Title not found" }

    let response = await searchMovies(title.title, title.releaseYear)
    if (response.results.length === 0 && title.releaseYear) {
      // Hand-entered years are often off — retry the search without it.
      response = await searchMovies(title.title)
    }

    const ranked = rankCandidates(
      { title: title.title, releaseYear: title.releaseYear },
      response.results.map((movie) => ({
        id: movie.id,
        title: movie.title,
        originalTitle: movie.original_title,
        releaseDate: movie.release_date,
        popularity: movie.popularity,
        voteCount: movie.vote_count,
        overview: movie.overview,
        posterPath: movie.poster_path,
      })),
    )

    const candidates = ranked.slice(0, MAX_CANDIDATES).map((entry) => ({
      tmdbId: entry.candidate.id,
      title: entry.candidate.title,
      originalTitle: entry.candidate.originalTitle ?? "",
      year: entry.candidate.releaseDate
        ? Number.parseInt(entry.candidate.releaseDate.slice(0, 4), 10) || null
        : null,
      overview: entry.candidate.overview ?? "",
      posterThumbUrl: tmdbImageUrl(entry.candidate.posterPath, "w185"),
      confidence: entry.confidence,
      score: Math.round(entry.score * 100) / 100,
      voteCount: entry.candidate.voteCount ?? 0,
    }))

    return { success: true, data: { candidates, query: title.title } }
  } catch (error) {
    return errorResult(error)
  }
}

/**
 * Build the incoming field set for one TMDB movie so the admin UI can render
 * a side-by-side current-vs-incoming diff before anything is written.
 */
export async function getTmdbEnrichmentPreview(
  titleId: string,
  tmdbId: number,
): Promise<EnrichResult<TmdbEnrichmentPreview>> {
  try {
    await requireAdminUser()
    if (!isTmdbConfigured()) return { success: false, error: TMDB_NOT_CONFIGURED_MESSAGE }

    z.string().min(1).parse(titleId)
    const movieId = z.number().int().positive().parse(tmdbId)

    const incoming = await buildIncomingEnrichment(movieId)
    return { success: true, data: { tmdbId: movieId, incoming } }
  } catch (error) {
    return errorResult(error)
  }
}

/**
 * Apply a chosen TMDB match to a title. `fields` picks exactly which fields
 * get overwritten — hand-written copy is never clobbered silently. Empty
 * incoming values are skipped even when selected, so enrichment can only add,
 * never blank out. Always records `tmdbId` for idempotency.
 */
export async function applyTmdbEnrichment(
  titleId: string,
  tmdbId: number,
  fields: EnrichableField[],
): Promise<EnrichResult<CatalogTitle>> {
  try {
    await requireAdminUser()
    if (!isTmdbConfigured()) return { success: false, error: TMDB_NOT_CONFIGURED_MESSAGE }

    const parsed = z
      .object({
        titleId: z.string().min(1),
        tmdbId: z.number().int().positive(),
        fields: z.array(z.enum(ENRICHABLE_FIELDS)),
      })
      .parse({ titleId, tmdbId, fields })

    await connectDB()
    const doc = await VisionTitle.findById(parsed.titleId)
    if (!doc) return { success: false, error: "Title not found" }

    const conflict = await VisionTitle.findOne({
      tmdbId: parsed.tmdbId,
      _id: { $ne: doc._id },
    })
    if (conflict) {
      return {
        success: false,
        error: `Another title (“${conflict.title}”) is already linked to this TMDB movie`,
      }
    }

    const incoming = await buildIncomingEnrichment(parsed.tmdbId)

    const update: Record<string, unknown> = { tmdbId: parsed.tmdbId }
    for (const field of parsed.fields) {
      const value = incoming[field]
      if (isEmptyIncoming(value)) continue
      update[field] = value
    }

    update.searchTerms = buildSearchTerms({
      title: doc.title,
      tagline: pick(update, "tagline", doc.tagline),
      synopsis: pick(update, "synopsis", doc.synopsis),
      genres: pick(update, "genres", doc.genres),
      tags: doc.tags,
      cast: pick(update, "cast", doc.cast),
      director: pick(update, "director", doc.director),
    })

    const saved = await VisionTitle.findByIdAndUpdate(
      doc._id,
      { $set: update },
      { new: true },
    )
    if (!saved) return { success: false, error: "Title not found" }

    revalidatePath("/admin/catalog")
    revalidatePath(`/admin/catalog/${saved._id}`)
    revalidatePath(`/title/${saved.slug}`)
    revalidatePath("/")
    return { success: true, data: serializeTitle(saved) }
  } catch (error) {
    return errorResult(error)
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

const MAX_CAST_NAMES = 8

async function buildIncomingEnrichment(tmdbId: number): Promise<EnrichmentFields> {
  const [details, credits, releaseDates] = await Promise.all([
    getMovieDetails(tmdbId),
    getMovieCredits(tmdbId),
    getMovieReleaseDates(tmdbId),
  ])

  const director =
    credits.crew.find((member) => member.job === "Director")?.name ?? ""
  const cast = [...credits.cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_CAST_NAMES)
    .map((member) => member.name)

  return {
    posterUrl: tmdbImageUrl(details.poster_path, "w500"),
    backdropUrl: tmdbImageUrl(details.backdrop_path, "original"),
    synopsis: details.overview ?? "",
    tagline: details.tagline ?? "",
    cast,
    director,
    genres: details.genres.map((genre) => genre.name),
    durationSeconds: details.runtime ? details.runtime * 60 : 0,
    maturityRating: certificationToMaturityRating(pickUsCertification(releaseDates)),
    releaseYear: details.release_date
      ? Number.parseInt(details.release_date.slice(0, 4), 10) || null
      : null,
  }
}

function isEmptyIncoming(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (typeof value === "number") return value === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

function pick<T>(update: Record<string, unknown>, key: string, fallback: T): T {
  return key in update ? (update[key] as T) : fallback
}

/** Mirrors `buildSearchTerms` in lib/actions/catalog.ts (module-private there). */
function buildSearchTerms(input: {
  title?: string
  tagline?: string
  synopsis?: string
  genres?: string[]
  tags?: string[]
  cast?: string[]
  director?: string
}): string[] {
  const parts = [
    input.title,
    input.tagline,
    input.synopsis,
    ...(input.genres ?? []),
    ...(input.tags ?? []),
    ...(input.cast ?? []),
    input.director,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return Array.from(new Set(parts.split(/[^a-z0-9]+/g).filter((s) => s.length > 2))).slice(0, 64)
}

function errorResult<T>(error: unknown): EnrichResult<T> {
  if (error instanceof TmdbNotConfiguredError) {
    return { success: false, error: TMDB_NOT_CONFIGURED_MESSAGE }
  }
  if (error instanceof z.ZodError) {
    return { success: false, error: error.errors.map((e) => e.message).join(", ") }
  }
  if (error instanceof Error) {
    if (error.name === "UnauthorizedError") return { success: false, error: "Unauthorized" }
    if (error.name === "ForbiddenError") return { success: false, error: "Forbidden" }
    console.error("[vision/catalog-enrich]", error)
    return { success: false, error: error.message }
  }
  return { success: false, error: "Unknown error" }
}
