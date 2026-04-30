/** Production origin for this app (Clerk satellite at vision.worldstreetgold.com). */
export const VISION_PRODUCTION_ORIGIN = "https://vision.worldstreetgold.com" as const

/**
 * Public site URL: env override, else production default, else local dev.
 */
export function resolveVisionAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) return fromEnv
  if (process.env.NODE_ENV === "production") return VISION_PRODUCTION_ORIGIN
  return "http://localhost:3000"
}
