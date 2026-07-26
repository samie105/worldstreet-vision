import "server-only"

import { env } from "@/lib/env"

/**
 * Minimal OMDb client for catalog metadata enrichment — the second provider
 * alongside `lib/tmdb/client.ts`. Server-side only: the API key must never
 * reach a client component.
 *
 * Same caching contract as TMDB (`next: { revalidate: 86400 }`) — film
 * metadata is near-static and it keeps admin retries + the bulk migration
 * cheap (OMDb free keys are capped at 1,000 requests/day).
 *
 * Degrades gracefully: when OMDB_API_KEY is unset every call throws
 * `OmdbNotConfiguredError`, which server actions surface as
 * "OMDB_API_KEY not configured" instead of crashing the admin UI.
 *
 * OMDb quirk: EVERY failure comes back as HTTP 200 with
 * `{ Response: "False", Error: "…" }`, so the status code alone proves
 * nothing — the payload is always checked.
 */

const OMDB_API_BASE = "https://www.omdbapi.com/"
const REVALIDATE_SECONDS = 86_400

export const OMDB_NOT_CONFIGURED_MESSAGE = "OMDB_API_KEY not configured"

export class OmdbNotConfiguredError extends Error {
  constructor() {
    super(OMDB_NOT_CONFIGURED_MESSAGE)
    this.name = "OmdbNotConfiguredError"
  }
}

/** Raised when OMDb answers `Response: "False"` — carries their `Error` string. */
export class OmdbApiError extends Error {
  readonly omdbError: string
  constructor(omdbError: string) {
    super(`OMDb request failed: ${omdbError}`)
    this.name = "OmdbApiError"
    this.omdbError = omdbError
  }
}

export function isOmdbConfigured(): boolean {
  return env.omdb.isConfigured
}

// ── Response shapes (subset of the OMDb payloads we consume) ────────────────

export type OmdbType = "movie" | "series" | "episode" | "game"

export interface OmdbSearchItem {
  Title: string
  /** "2014" for films, "2008–2013" (en dash) or "2008–" for series. */
  Year: string
  imdbID: string
  Type: OmdbType
  /** Absolute URL or the literal string "N/A". */
  Poster: string
}

export interface OmdbSearchResponse {
  Search: OmdbSearchItem[]
  totalResults: number
}

export interface OmdbDetailResponse {
  Title: string
  Year: string
  Rated: string
  Released: string
  /** "136 min" or "N/A". */
  Runtime: string
  /** "Action, Adventure, Comedy" or "N/A". */
  Genre: string
  Director: string
  Writer: string
  /** "Robert Downey Jr., Chris Evans, Mark Ruffalo" or "N/A". */
  Actors: string
  Plot: string
  Language: string
  Country: string
  Awards: string
  Poster: string
  Metascore: string
  imdbRating: string
  imdbVotes: string
  imdbID: string
  Type: OmdbType
  totalSeasons?: string
}

interface OmdbEnvelope {
  Response: "True" | "False"
  Error?: string
}

/**
 * OMDb `Error` strings that mean "nothing matched" rather than "the request
 * was broken" — a search should return an empty list for these, not blow up.
 */
const SOFT_SEARCH_ERRORS = ["movie not found", "series not found", "too many results"]

// ── Fetch core ───────────────────────────────────────────────────────────────

async function omdbFetch<T>(params: Record<string, string>): Promise<T> {
  if (!isOmdbConfigured()) throw new OmdbNotConfiguredError()

  const url = new URL(OMDB_API_BASE)
  url.searchParams.set("apikey", env.omdb.apiKey)
  url.searchParams.set("r", "json")
  for (const [name, value] of Object.entries(params)) {
    if (value !== "") url.searchParams.set(name, value)
  }

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    next: { revalidate: REVALIDATE_SECONDS },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`OMDb request failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const payload = (await response.json()) as T & OmdbEnvelope
  // OMDb reports failures with HTTP 200 — the envelope is the real status.
  if (payload.Response !== "True") {
    throw new OmdbApiError(payload.Error ?? "Unknown OMDb error")
  }
  return payload
}

// ── Endpoints ────────────────────────────────────────────────────────────────

/**
 * Title search (`?s=`). Unlike TMDB's movie-only search this also returns
 * series, which Vision's catalog needs — the year-range parsing in
 * `lib/omdb/map.ts` handles "2008–2013" style results.
 *
 * "not found" / "too many results" are normal outcomes and come back as an
 * empty list; anything else (bad key, quota exhausted) still throws.
 */
export async function searchMovies(query: string, year?: number | null): Promise<OmdbSearchResponse> {
  try {
    const payload = await omdbFetch<{ Search?: OmdbSearchItem[]; totalResults?: string }>({
      s: query,
      ...(year ? { y: String(year) } : {}),
    })
    return {
      Search: payload.Search ?? [],
      totalResults: Number.parseInt(payload.totalResults ?? "0", 10) || 0,
    }
  } catch (error) {
    if (error instanceof OmdbApiError) {
      const message = error.omdbError.toLowerCase()
      if (SOFT_SEARCH_ERRORS.some((soft) => message.includes(soft))) {
        return { Search: [], totalResults: 0 }
      }
    }
    throw error
  }
}

/** Full record for one IMDb id (`?i=`), with the long plot for synopses. */
export async function getByImdbId(imdbId: string): Promise<OmdbDetailResponse> {
  return omdbFetch<OmdbDetailResponse>({ i: imdbId, plot: "full" })
}
