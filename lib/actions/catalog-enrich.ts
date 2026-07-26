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
  searchMovies as searchTmdbMovies,
  tmdbImageUrl,
  TMDB_NOT_CONFIGURED_MESSAGE,
  TmdbNotConfiguredError,
} from "@/lib/tmdb/client"
import {
  getByImdbId,
  isOmdbConfigured,
  searchMovies as searchOmdbTitles,
  OMDB_NOT_CONFIGURED_MESSAGE,
  OmdbApiError,
  OmdbNotConfiguredError,
} from "@/lib/omdb/client"
import {
  mapOmdbDetailToEnrichment,
  rankOmdbCandidates,
  OMDB_UNAVAILABLE_FIELDS,
} from "@/lib/omdb/map"
import {
  certificationToMaturityRating,
  ENRICHABLE_FIELDS,
  pickUsCertification,
  rankCandidates,
  type EnrichableField,
  type EnrichmentFields,
  type LocalTitleFacts,
  type MatchConfidence,
} from "@/lib/tmdb/match"

export interface EnrichResult<T> {
  success: boolean
  data?: T
  error?: string
}

/** Metadata providers Vision can enrich from. Either, both or neither may be configured. */
export type EnrichSource = "tmdb" | "omdb"

/**
 * Which provider record a preview/apply refers to. Discriminated so the two
 * id shapes (numeric TMDB movie id vs. string IMDb id) never get confused.
 */
export type EnrichSourceRef =
  | { source: "tmdb"; tmdbId: number }
  | { source: "omdb"; imdbId: string }

export interface MetadataCandidate {
  source: EnrichSource
  /** TMDB movie id — 0 for OMDb candidates. */
  tmdbId: number
  /** IMDb id — "" for TMDB candidates. */
  imdbId: string
  title: string
  originalTitle: string
  year: number | null
  overview: string
  /** Small poster thumbnail for the picker; "" when the provider has none. */
  posterThumbUrl: string
  confidence: MatchConfidence
  /** Blended 0..1 match score — shown so admins can sanity-check the ranking. */
  score: number
  voteCount: number
  /** "movie" / "series" when the provider says so (OMDb does), else "". */
  mediaType: string
}

/** Back-compat alias for the pre-OMDb name. */
export type TmdbCandidate = MetadataCandidate

export interface EnrichmentPreview {
  source: EnrichSource
  tmdbId: number | null
  imdbId: string | null
  incoming: EnrichmentFields
  /** Fields this provider can never supply (OMDb: backdropUrl, tagline). */
  unavailableFields: EnrichableField[]
}

export interface TmdbEnrichmentPreview {
  tmdbId: number
  incoming: EnrichmentFields
}

const MAX_CANDIDATES = 8
const MAX_CAST_NAMES = 8
const NO_PROVIDER_CONFIGURED_MESSAGE = "TMDB_API_KEY or OMDB_API_KEY not configured"

const sourceRefSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("tmdb"), tmdbId: z.number().int().positive() }),
  z.object({ source: z.literal("omdb"), imdbId: z.string().regex(/^tt\d{6,10}$/i) }),
])

// ── Provider-agnostic actions ────────────────────────────────────────────────

/**
 * Search a metadata provider for candidate matches for an existing catalog
 * title. Never applies anything — returns ranked candidates with confidence so
 * the admin can pick (low-confidence matches must always go through a human).
 *
 * `opts.source` picks the provider; omitted it defaults to TMDB when
 * configured, otherwise OMDb.
 */
export async function searchMetadataForTitle(
  titleId: string,
  opts?: { source?: EnrichSource },
): Promise<
  EnrichResult<{
    candidates: MetadataCandidate[]
    query: string
    source: EnrichSource
    availableSources: EnrichSource[]
  }>
> {
  try {
    await requireAdminUser()

    const parsed = z.string().min(1).parse(titleId)
    const requested = z.enum(["tmdb", "omdb"]).optional().parse(opts?.source)
    const resolved = resolveSource(requested)
    if (!resolved.source) return { success: false, error: resolved.error }

    await connectDB()
    const title = await VisionTitle.findById(parsed)
    if (!title) return { success: false, error: "Title not found" }

    const local: LocalTitleFacts = { title: title.title, releaseYear: title.releaseYear }
    const candidates =
      resolved.source === "tmdb"
        ? await searchTmdbCandidates(local)
        : await searchOmdbCandidates(local)

    return {
      success: true,
      data: {
        candidates,
        query: title.title,
        source: resolved.source,
        availableSources: availableSources(),
      },
    }
  } catch (error) {
    return errorResult(error)
  }
}

/**
 * Build the incoming field set for one provider record so the admin UI can
 * render a side-by-side current-vs-incoming diff before anything is written.
 */
export async function getEnrichmentPreview(
  titleId: string,
  ref: EnrichSourceRef,
): Promise<EnrichResult<EnrichmentPreview>> {
  try {
    await requireAdminUser()

    z.string().min(1).parse(titleId)
    const parsedRef = sourceRefSchema.parse(ref)
    const resolved = resolveSource(parsedRef.source)
    if (!resolved.source) return { success: false, error: resolved.error }

    const incoming = await buildIncomingEnrichment(parsedRef)
    return {
      success: true,
      data: {
        source: parsedRef.source,
        tmdbId: parsedRef.source === "tmdb" ? parsedRef.tmdbId : null,
        imdbId: parsedRef.source === "omdb" ? parsedRef.imdbId : null,
        incoming,
        unavailableFields: unavailableFieldsFor(parsedRef.source),
      },
    }
  } catch (error) {
    return errorResult(error)
  }
}

/**
 * Apply a chosen provider match to a title. `fields` picks exactly which
 * fields get overwritten — hand-written copy is never clobbered silently.
 * Empty incoming values are skipped even when selected, so enrichment can only
 * add, never blank out. Always records `tmdbId` or `imdbId` for idempotency.
 */
export async function applyEnrichment(
  titleId: string,
  ref: EnrichSourceRef,
  fields: EnrichableField[],
): Promise<EnrichResult<CatalogTitle>> {
  try {
    await requireAdminUser()

    const parsed = z
      .object({
        titleId: z.string().min(1),
        ref: sourceRefSchema,
        fields: z.array(z.enum(ENRICHABLE_FIELDS)),
      })
      .parse({ titleId, ref, fields })

    const resolved = resolveSource(parsed.ref.source)
    if (!resolved.source) return { success: false, error: resolved.error }

    await connectDB()
    const doc = await VisionTitle.findById(parsed.titleId)
    if (!doc) return { success: false, error: "Title not found" }

    const linkQuery =
      parsed.ref.source === "tmdb"
        ? { tmdbId: parsed.ref.tmdbId }
        : { imdbId: parsed.ref.imdbId }
    const conflict = await VisionTitle.findOne({ ...linkQuery, _id: { $ne: doc._id } })
    if (conflict) {
      const label = parsed.ref.source === "tmdb" ? "TMDB movie" : "IMDb entry"
      return {
        success: false,
        error: `Another title (“${conflict.title}”) is already linked to this ${label}`,
      }
    }

    const incoming = await buildIncomingEnrichment(parsed.ref)

    const update: Record<string, unknown> = { ...linkQuery }
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

    const saved = await VisionTitle.findByIdAndUpdate(doc._id, { $set: update }, { new: true })
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

// ── TMDB-named wrappers (kept so existing callers keep working) ─────────────

export async function searchTmdbForTitle(
  titleId: string,
): Promise<EnrichResult<{ candidates: TmdbCandidate[]; query: string }>> {
  const result = await searchMetadataForTitle(titleId, { source: "tmdb" })
  if (!result.success || !result.data) return { success: false, error: result.error }
  return { success: true, data: { candidates: result.data.candidates, query: result.data.query } }
}

export async function getTmdbEnrichmentPreview(
  titleId: string,
  tmdbId: number,
): Promise<EnrichResult<TmdbEnrichmentPreview>> {
  const result = await getEnrichmentPreview(titleId, { source: "tmdb", tmdbId })
  if (!result.success || !result.data) return { success: false, error: result.error }
  return { success: true, data: { tmdbId, incoming: result.data.incoming } }
}

export async function applyTmdbEnrichment(
  titleId: string,
  tmdbId: number,
  fields: EnrichableField[],
): Promise<EnrichResult<CatalogTitle>> {
  return applyEnrichment(titleId, { source: "tmdb", tmdbId }, fields)
}

// ── Provider selection ───────────────────────────────────────────────────────

function availableSources(): EnrichSource[] {
  const sources: EnrichSource[] = []
  if (isTmdbConfigured()) sources.push("tmdb")
  if (isOmdbConfigured()) sources.push("omdb")
  return sources
}

type SourceResolution =
  | { source: EnrichSource; error?: undefined }
  | { source?: undefined; error: string }

/** TMDB wins by default when configured (richer payload); OMDb is the fallback. */
function resolveSource(requested?: EnrichSource | null): SourceResolution {
  const available = availableSources()
  if (requested) {
    if (available.includes(requested)) return { source: requested }
    return {
      error: requested === "tmdb" ? TMDB_NOT_CONFIGURED_MESSAGE : OMDB_NOT_CONFIGURED_MESSAGE,
    }
  }
  const [preferred] = available
  if (!preferred) return { error: NO_PROVIDER_CONFIGURED_MESSAGE }
  return { source: preferred }
}

function unavailableFieldsFor(source: EnrichSource): EnrichableField[] {
  return source === "omdb" ? [...OMDB_UNAVAILABLE_FIELDS] : []
}

// ── Candidate search per provider ────────────────────────────────────────────

async function searchTmdbCandidates(local: LocalTitleFacts): Promise<MetadataCandidate[]> {
  let response = await searchTmdbMovies(local.title, local.releaseYear)
  if (response.results.length === 0 && local.releaseYear) {
    // Hand-entered years are often off — retry the search without it.
    response = await searchTmdbMovies(local.title)
  }

  const ranked = rankCandidates(
    local,
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

  return ranked.slice(0, MAX_CANDIDATES).map((entry) => ({
    source: "tmdb" as const,
    tmdbId: entry.candidate.id,
    imdbId: "",
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
    mediaType: "movie",
  }))
}

async function searchOmdbCandidates(local: LocalTitleFacts): Promise<MetadataCandidate[]> {
  let response = await searchOmdbTitles(local.title, local.releaseYear)
  if (response.Search.length === 0 && local.releaseYear) {
    response = await searchOmdbTitles(local.title)
  }

  const ranked = rankOmdbCandidates(local, response.Search)

  return ranked.slice(0, MAX_CANDIDATES).map((entry) => ({
    source: "omdb" as const,
    tmdbId: 0,
    imdbId: entry.candidate.imdbId,
    title: entry.candidate.title,
    originalTitle: "",
    year: entry.candidate.year,
    // OMDb search rows carry no plot — the preview fetch fills it in.
    overview: "",
    posterThumbUrl: entry.candidate.posterUrl,
    confidence: entry.confidence,
    score: Math.round(entry.score * 100) / 100,
    voteCount: 0,
    mediaType: entry.candidate.mediaType,
  }))
}

// ── Incoming field builders ──────────────────────────────────────────────────

async function buildIncomingEnrichment(ref: EnrichSourceRef): Promise<EnrichmentFields> {
  if (ref.source === "omdb") {
    return mapOmdbDetailToEnrichment(await getByImdbId(ref.imdbId))
  }
  return buildTmdbEnrichment(ref.tmdbId)
}

async function buildTmdbEnrichment(tmdbId: number): Promise<EnrichmentFields> {
  const [details, credits, releaseDates] = await Promise.all([
    getMovieDetails(tmdbId),
    getMovieCredits(tmdbId),
    getMovieReleaseDates(tmdbId),
  ])

  const director = credits.crew.find((member) => member.job === "Director")?.name ?? ""
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

// ── Internals ────────────────────────────────────────────────────────────────

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
  if (error instanceof OmdbNotConfiguredError) {
    return { success: false, error: OMDB_NOT_CONFIGURED_MESSAGE }
  }
  if (error instanceof OmdbApiError) {
    return { success: false, error: `OMDb: ${error.omdbError}` }
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
