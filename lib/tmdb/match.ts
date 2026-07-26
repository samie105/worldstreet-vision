/**
 * Pure TMDB matching + enrichment-shaping logic.
 *
 * Deliberately import-free and side-effect-free:
 * - safe to import from client components (field list + types for the admin UI)
 * - unit-testable with `node --experimental-strip-types` and a fixture payload
 * - mirrored 1:1 in `migrations/002-enrich-tmdb.mjs` (keep both in sync)
 *
 * Matching philosophy: a wrong poster on the wrong film is worse than no
 * poster. Only "high" confidence (near-exact title AND corroborating year)
 * may ever be auto-applied; everything else needs a human in the admin UI.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface LocalTitleFacts {
  title: string
  releaseYear?: number | null
}

export interface TmdbCandidateFacts {
  id: number
  title: string
  originalTitle?: string
  /** ISO date string from TMDB, e.g. "1995-12-15". */
  releaseDate?: string
  popularity?: number
  voteCount?: number
}

export type MatchConfidence = "high" | "medium" | "low"

export interface ScoredCandidate<T extends TmdbCandidateFacts = TmdbCandidateFacts> {
  candidate: T
  /** Blended 0..1 score (title similarity + year proximity). */
  score: number
  confidence: MatchConfidence
  titleScore: number
  yearScore: number
}

/** Fields the enrichment flow is allowed to overwrite, in display order. */
export const ENRICHABLE_FIELDS = [
  "posterUrl",
  "backdropUrl",
  "synopsis",
  "tagline",
  "cast",
  "director",
  "genres",
  "durationSeconds",
  "maturityRating",
  "releaseYear",
] as const

export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number]

/** Incoming values built from TMDB payloads, keyed like `VisionTitle`. */
export interface EnrichmentFields {
  posterUrl: string
  backdropUrl: string
  synopsis: string
  tagline: string
  cast: string[]
  director: string
  genres: string[]
  durationSeconds: number
  maturityRating: "g" | "pg" | "pg13" | "r" | null
  releaseYear: number | null
}

// ── Scoring thresholds ───────────────────────────────────────────────────────

/** Near-exact title similarity required before a match may auto-apply. */
export const HIGH_CONFIDENCE_TITLE_SCORE = 0.95
/** Year must corroborate (exact or ±1) before a match may auto-apply. */
export const HIGH_CONFIDENCE_YEAR_SCORE = 0.85
/** Below this blended score a candidate is "low" and never auto-applies. */
export const MEDIUM_CONFIDENCE_SCORE = 0.72

const TITLE_WEIGHT = 0.75
const YEAR_WEIGHT = 0.25

// ── Normalization + similarity ───────────────────────────────────────────────

/** Lowercase, strip diacritics/punctuation, collapse whitespace. */
export function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function bigramCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (let i = 0; i < value.length - 1; i++) {
    const gram = value.slice(i, i + 2)
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }
  return counts
}

/** Sørensen–Dice similarity over character bigrams of normalized titles (0..1). */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return 0
  const ga = bigramCounts(na)
  const gb = bigramCounts(nb)
  let overlap = 0
  for (const [gram, count] of ga) {
    const other = gb.get(gram)
    if (other) overlap += Math.min(count, other)
  }
  return (2 * overlap) / (na.length - 1 + nb.length - 1)
}

/**
 * 0..1 proximity of the candidate's release year to the local title's year.
 * Unknown on either side is neutral (0.5) — never enough for auto-apply.
 */
export function yearProximityScore(
  localYear: number | null | undefined,
  releaseDate: string | undefined,
): number {
  const candidateYear = releaseDate ? Number.parseInt(releaseDate.slice(0, 4), 10) : Number.NaN
  if (!localYear || Number.isNaN(candidateYear)) return 0.5
  const delta = Math.abs(localYear - candidateYear)
  if (delta === 0) return 1
  if (delta === 1) return 0.85
  if (delta === 2) return 0.6
  if (delta <= 5) return 0.3
  return 0
}

// ── Candidate ranking ────────────────────────────────────────────────────────

export function scoreCandidate<T extends TmdbCandidateFacts>(
  local: LocalTitleFacts,
  candidate: T,
): ScoredCandidate<T> {
  const titleScore = Math.max(
    titleSimilarity(local.title, candidate.title),
    candidate.originalTitle ? titleSimilarity(local.title, candidate.originalTitle) : 0,
  )
  const yearScore = yearProximityScore(local.releaseYear, candidate.releaseDate)
  const score = TITLE_WEIGHT * titleScore + YEAR_WEIGHT * yearScore

  let confidence: MatchConfidence = "low"
  if (titleScore >= HIGH_CONFIDENCE_TITLE_SCORE && yearScore >= HIGH_CONFIDENCE_YEAR_SCORE) {
    confidence = "high"
  } else if (score >= MEDIUM_CONFIDENCE_SCORE) {
    confidence = "medium"
  }

  return { candidate, score, confidence, titleScore, yearScore }
}

/** Score and sort candidates best-first (ties broken by vote count, then popularity). */
export function rankCandidates<T extends TmdbCandidateFacts>(
  local: LocalTitleFacts,
  candidates: T[],
): ScoredCandidate<T>[] {
  return candidates
    .map((candidate) => scoreCandidate(local, candidate))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.candidate.voteCount ?? 0) - (a.candidate.voteCount ?? 0) ||
        (b.candidate.popularity ?? 0) - (a.candidate.popularity ?? 0),
    )
}

// ── Certification → maturityRating ───────────────────────────────────────────

/** Map a US MPA certification string onto Vision's maturity scale. */
export function certificationToMaturityRating(
  certification: string,
): EnrichmentFields["maturityRating"] {
  const cert = certification.trim().toUpperCase()
  if (cert === "G") return "g"
  if (cert === "PG") return "pg"
  if (cert === "PG-13") return "pg13"
  if (cert === "R" || cert === "NC-17") return "r"
  return null
}

interface ReleaseDatesPayload {
  results?: {
    iso_3166_1: string
    release_dates?: { certification?: string; type?: number }[]
  }[]
}

/**
 * Pick the US certification from a TMDB `/movie/{id}/release_dates` payload,
 * preferring the theatrical release (type 3). Returns "" when absent.
 */
export function pickUsCertification(payload: ReleaseDatesPayload): string {
  const us = payload.results?.find((entry) => entry.iso_3166_1 === "US")
  if (!us?.release_dates?.length) return ""
  const withCert = us.release_dates.filter((r) => (r.certification ?? "").trim() !== "")
  if (withCert.length === 0) return ""
  const theatrical = withCert.find((r) => r.type === 3)
  return (theatrical ?? withCert[0]).certification?.trim() ?? ""
}
