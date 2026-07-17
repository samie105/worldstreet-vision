import type { CatalogTitle } from "./types"

/**
 * Ratings a kids profile may see. Anything outside this set — including
 * missing or unrecognized ratings — is NOT kid-safe (fail closed).
 */
export const KID_SAFE_RATINGS: ReadonlySet<string> = new Set([
  "g",
  "pg",
  "tv-y",
  "tv-g",
  "tv-y7",
  "tv-pg",
])

/** Values for Mongo `$in` filters (the schema stores lowercase ratings). */
export const KID_SAFE_RATING_VALUES: readonly string[] = [...KID_SAFE_RATINGS]

export function normalizeMaturityRating(rating: unknown): string {
  return typeof rating === "string" ? rating.trim().toLowerCase() : ""
}

export function isKidSafeRating(rating: unknown): boolean {
  const normalized = normalizeMaturityRating(rating)
  return normalized.length > 0 && KID_SAFE_RATINGS.has(normalized)
}

/** A missing title is not kid-safe either — deep links to unrated content stay blocked. */
export function isKidSafeTitle(
  title: Pick<CatalogTitle, "maturityRating"> | null | undefined,
): boolean {
  if (!title) return false
  return isKidSafeRating(title.maturityRating)
}
