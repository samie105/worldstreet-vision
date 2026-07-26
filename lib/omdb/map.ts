/**
 * Pure OMDb → Vision mapping + candidate ranking.
 *
 * Deliberately side-effect-free and free of `server-only` so it stays
 * unit-testable with `node --experimental-strip-types` and importable from
 * client components (the admin panel needs the unavailable-field list).
 *
 * Scoring is NOT re-implemented here: everything routes through the exported
 * primitives in `lib/tmdb/match.ts` so both providers rank identically and a
 * low-confidence OMDb match can never sneak past the auto-apply bar.
 *
 * Provider gaps are honest gaps: OMDb ships a single `Poster` and no tagline,
 * so `backdropUrl` and `tagline` are always "" and the UI shows them as
 * unavailable. Never invent a value the provider did not return.
 */

import {
  certificationToMaturityRating,
  rankCandidates,
  type EnrichableField,
  type EnrichmentFields,
  type LocalTitleFacts,
  type ScoredCandidate,
} from "@/lib/tmdb/match"

// ── Payload shapes (loose on purpose — fixtures may be partial) ─────────────

/** Subset of an OMDb `?i=` detail payload that enrichment consumes. */
export interface OmdbDetailFacts {
  Title?: string
  Year?: string
  Rated?: string
  Runtime?: string
  Genre?: string
  Plot?: string
  Poster?: string
  Actors?: string
  Director?: string
  imdbID?: string
  Type?: string
}

/** Subset of one OMDb `?s=` search row. */
export interface OmdbSearchFacts {
  Title?: string
  Year?: string
  imdbID?: string
  Type?: string
  Poster?: string
}

/** A search row reshaped for the shared scorer in `lib/tmdb/match.ts`. */
export interface OmdbCandidateFacts {
  /**
   * Numeric surrogate (the digits of the IMDb id) so OMDb rows satisfy the
   * shared `TmdbCandidateFacts` generic. `imdbId` is the real identifier.
   */
  id: number
  imdbId: string
  title: string
  /** Synthesized `${year}-01-01` — OMDb search has no release date, only a year. */
  releaseDate?: string
  /** Preserves OMDb's own relevance order when scores tie. */
  popularity?: number
  year: number | null
  posterUrl: string
  mediaType: string
}

// ── Fields OMDb cannot supply ────────────────────────────────────────────────

/** OMDb has one poster image and no tagline — these can never be filled. */
export const OMDB_UNAVAILABLE_FIELDS: readonly EnrichableField[] = ["backdropUrl", "tagline"]

export function isOmdbFieldAvailable(field: EnrichableField): boolean {
  return !OMDB_UNAVAILABLE_FIELDS.includes(field)
}

// ── Value parsing (OMDb writes every missing value as the string "N/A") ─────

const NOT_AVAILABLE = "n/a"
const EARLIEST_FILM_YEAR = 1870
const LATEST_PLAUSIBLE_YEAR = 2100

/** Trim an OMDb string, collapsing its "N/A" sentinel to "". */
export function omdbText(value: string | null | undefined): string {
  const text = (value ?? "").trim()
  if (text === "" || text.toLowerCase() === NOT_AVAILABLE) return ""
  return text
}

/**
 * First plausible 4-digit year in an OMDb `Year`.
 * Handles films ("2014"), closed series ranges ("2008–2013", en dash),
 * ongoing series ("2014–") and "N/A".
 */
export function parseOmdbYear(value: string | null | undefined): number | null {
  const text = omdbText(value)
  const match = text.match(/\d{4}/)
  if (!match) return null
  const year = Number.parseInt(match[0], 10)
  if (!Number.isFinite(year) || year < EARLIEST_FILM_YEAR || year > LATEST_PLAUSIBLE_YEAR) {
    return null
  }
  return year
}

/** "136 min" → 8160. Also tolerates "2 h 16 min". "N/A" → 0. */
export function parseOmdbRuntimeSeconds(value: string | null | undefined): number {
  const text = omdbText(value)
  if (!text) return 0
  const hours = text.match(/(\d+)\s*h/i)
  const minutes = text.match(/(\d+)\s*min/i)
  const total =
    (hours ? Number.parseInt(hours[1], 10) : 0) * 3600 +
    (minutes ? Number.parseInt(minutes[1], 10) : 0) * 60
  if (total > 0) return total
  // Bare number of minutes, e.g. "136".
  const bare = /^\d+$/.test(text) ? Number.parseInt(text, 10) : 0
  return bare > 0 ? bare * 60 : 0
}

/** "Action, Adventure, Comedy" → ["Action", "Adventure", "Comedy"]. */
export function splitOmdbList(value: string | null | undefined): string[] {
  const text = omdbText(value)
  if (!text) return []
  return text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "" && entry.toLowerCase() !== NOT_AVAILABLE)
}

/** Poster URL, or "" when OMDb has none ("N/A") or returns something unusable. */
export function omdbPosterUrl(value: string | null | undefined): string {
  const text = omdbText(value)
  return text.startsWith("http") ? text : ""
}

// ── Detail → EnrichmentFields ────────────────────────────────────────────────

/**
 * Map an OMDb detail payload onto the shared `EnrichmentFields` shape.
 *
 * `Rated` runs through the same `certificationToMaturityRating` used for TMDB
 * certifications, so TV ratings ("TV-MA") and "Not Rated" deliberately land on
 * `null` rather than being guessed onto Vision's G/PG/PG-13/R scale.
 */
export function mapOmdbDetailToEnrichment(detail: OmdbDetailFacts): EnrichmentFields {
  return {
    posterUrl: omdbPosterUrl(detail.Poster),
    // OMDb ships a single poster image — there is no backdrop to map.
    backdropUrl: "",
    synopsis: omdbText(detail.Plot),
    // OMDb has no tagline field.
    tagline: "",
    cast: splitOmdbList(detail.Actors),
    director: splitOmdbList(detail.Director).join(", "),
    genres: splitOmdbList(detail.Genre),
    durationSeconds: parseOmdbRuntimeSeconds(detail.Runtime),
    maturityRating: certificationToMaturityRating(omdbText(detail.Rated)),
    releaseYear: parseOmdbYear(detail.Year),
  }
}

// ── Search rows → ranked candidates ──────────────────────────────────────────

/** Digits of an IMDb id ("tt3896198" → 3896198); 0 when it is unparseable. */
function imdbIdToNumericSurrogate(imdbId: string): number {
  const digits = imdbId.replace(/\D/g, "")
  return digits === "" ? 0 : Number.parseInt(digits, 10)
}

export function toOmdbCandidateFacts(
  item: OmdbSearchFacts,
  index = 0,
  total = 0,
): OmdbCandidateFacts {
  const imdbId = omdbText(item.imdbID)
  const year = parseOmdbYear(item.Year)
  return {
    id: imdbIdToNumericSurrogate(imdbId),
    imdbId,
    title: omdbText(item.Title),
    // OMDb search exposes a year only — synthesize a date the shared
    // `yearProximityScore` can read. An unknown year stays undefined so the
    // scorer treats it as neutral instead of pretending it matched.
    releaseDate: year === null ? undefined : `${year}-01-01`,
    popularity: total > 0 ? total - index : 0,
    year,
    posterUrl: omdbPosterUrl(item.Poster),
    mediaType: omdbText(item.Type),
  }
}

/**
 * Score and sort OMDb search rows with the shared TMDB primitives — identical
 * thresholds, identical confidence bands, no provider-specific leniency.
 */
export function rankOmdbCandidates(
  local: LocalTitleFacts,
  results: OmdbSearchFacts[],
): ScoredCandidate<OmdbCandidateFacts>[] {
  const facts = results
    .map((item, index) => toOmdbCandidateFacts(item, index, results.length))
    .filter((candidate) => candidate.imdbId !== "" && candidate.title !== "")
  return rankCandidates(local, facts)
}
