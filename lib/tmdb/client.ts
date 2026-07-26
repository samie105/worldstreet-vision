import "server-only"

import { env } from "@/lib/env"

/**
 * Minimal TMDB v3 client for catalog metadata enrichment. Server-side only —
 * the API key must never reach a client component.
 *
 * All lookups cache for a day (`next: { revalidate: 86400 }`): movie metadata
 * is near-static, and it keeps admin retries + the bulk migration cheap.
 *
 * Degrades gracefully: when TMDB_API_KEY is unset every call throws
 * `TmdbNotConfiguredError`, which server actions surface as
 * "TMDB_API_KEY not configured" instead of crashing the admin UI.
 */

const TMDB_API_BASE = "https://api.themoviedb.org/3"
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"
const REVALIDATE_SECONDS = 86_400

export const TMDB_NOT_CONFIGURED_MESSAGE = "TMDB_API_KEY not configured"

export class TmdbNotConfiguredError extends Error {
  constructor() {
    super(TMDB_NOT_CONFIGURED_MESSAGE)
    this.name = "TmdbNotConfiguredError"
  }
}

export function isTmdbConfigured(): boolean {
  return env.tmdb.isConfigured
}

// ── Response shapes (subset of the TMDB payloads we consume) ────────────────

export interface TmdbSearchMovieResult {
  id: number
  title: string
  original_title: string
  release_date?: string
  overview: string
  poster_path: string | null
  backdrop_path: string | null
  popularity: number
  vote_count: number
  genre_ids: number[]
}

export interface TmdbSearchResponse {
  page: number
  results: TmdbSearchMovieResult[]
  total_pages: number
  total_results: number
}

export interface TmdbMovieDetails {
  id: number
  title: string
  original_title: string
  overview: string
  tagline: string
  release_date?: string
  runtime: number | null
  genres: { id: number; name: string }[]
  poster_path: string | null
  backdrop_path: string | null
}

export interface TmdbMovieCredits {
  id: number
  cast: { name: string; character: string; order: number }[]
  crew: { name: string; job: string; department: string }[]
}

export interface TmdbReleaseDatesResponse {
  id: number
  results: {
    iso_3166_1: string
    release_dates: { certification: string; type: number }[]
  }[]
}

export interface TmdbGenreListResponse {
  genres: { id: number; name: string }[]
}

// ── Fetch core ───────────────────────────────────────────────────────────────

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!isTmdbConfigured()) throw new TmdbNotConfiguredError()
  const key = env.tmdb.apiKey

  const url = new URL(`${TMDB_API_BASE}${path}`)
  for (const [name, value] of Object.entries(params)) {
    if (value !== "") url.searchParams.set(name, value)
  }

  // v4 read access tokens are JWTs (contain dots) and go in the header;
  // classic v3 keys ride as the `api_key` query param.
  const headers: Record<string, string> = { accept: "application/json" }
  if (key.includes(".")) {
    headers.Authorization = `Bearer ${key}`
  } else {
    url.searchParams.set("api_key", key)
  }

  const response = await fetch(url, { headers, next: { revalidate: REVALIDATE_SECONDS } })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`TMDB ${path} failed (${response.status}): ${body.slice(0, 200)}`)
  }
  return (await response.json()) as T
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export async function searchMovies(
  query: string,
  year?: number | null,
): Promise<TmdbSearchResponse> {
  return tmdbFetch<TmdbSearchResponse>("/search/movie", {
    query,
    include_adult: "false",
    ...(year ? { year: String(year) } : {}),
  })
}

export async function getMovieDetails(tmdbId: number): Promise<TmdbMovieDetails> {
  return tmdbFetch<TmdbMovieDetails>(`/movie/${tmdbId}`)
}

export async function getMovieCredits(tmdbId: number): Promise<TmdbMovieCredits> {
  return tmdbFetch<TmdbMovieCredits>(`/movie/${tmdbId}/credits`)
}

export async function getMovieReleaseDates(tmdbId: number): Promise<TmdbReleaseDatesResponse> {
  return tmdbFetch<TmdbReleaseDatesResponse>(`/movie/${tmdbId}/release_dates`)
}

export async function getMovieGenres(): Promise<TmdbGenreListResponse> {
  return tmdbFetch<TmdbGenreListResponse>("/genre/movie/list")
}

// ── Image URLs ───────────────────────────────────────────────────────────────

export type TmdbImageSize = "w92" | "w185" | "w342" | "w500" | "w780" | "original"

/** Build an image.tmdb.org URL, or "" when TMDB has no image path. */
export function tmdbImageUrl(path: string | null | undefined, size: TmdbImageSize): string {
  if (!path) return ""
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}
