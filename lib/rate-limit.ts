import "server-only"

interface Bucket {
  count: number
  expiresAt: number
}

const buckets = new Map<string, Bucket>()

interface RateLimitOptions {
  limit: number
  windowMs: number
  identifier: string
}

/**
 * In-memory rate limiter — fine for low-volume routes (webhooks, sign-up)
 * but should be swapped for Redis/Upstash in production. Returns the number
 * of remaining requests in the window or throws when the bucket is empty.
 */
export function rateLimit({ limit, windowMs, identifier }: RateLimitOptions): number {
  const now = Date.now()
  const existing = buckets.get(identifier)
  if (!existing || existing.expiresAt < now) {
    buckets.set(identifier, { count: 1, expiresAt: now + windowMs })
    return limit - 1
  }
  if (existing.count >= limit) {
    throw new RateLimitError(`Rate limit exceeded for ${identifier}`)
  }
  existing.count += 1
  return Math.max(0, limit - existing.count)
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RateLimitError"
  }
}
