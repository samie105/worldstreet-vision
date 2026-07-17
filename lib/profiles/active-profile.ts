import "server-only"

import { cache } from "react"
import { cookies } from "next/headers"

import { auth } from "@/lib/auth/runtime"
import { connectDB } from "@/lib/db/mongodb"
import VisionProfile from "@/models/VisionProfile"

/** Mirrors the cookie written by the client store (lib/profiles/store.tsx). */
const ACTIVE_PROFILE_COOKIE = "vision_profile"

export interface ActiveViewerProfile {
  id: string
  name: string
  isKid: boolean
  /**
   * True when this is the account's FIRST viewer profile — the "primary" one
   * that also inherits legacy (pre-per-profile) watch history.
   */
  isPrimary: boolean
}

/**
 * Resolves the viewer sub-profile the current device is browsing as, from the
 * `vision_profile` cookie. Falls back to the account's first viewer profile
 * when the cookie is missing or stale, and to `null` when there is no session,
 * no database, or the account has no viewer profiles yet.
 *
 * NOTE: the active profile is a client-set cookie, so treat this as
 * parental-control-grade gating (kids UX), not a security boundary.
 * Memoized per request via React `cache()`.
 */
export const getActiveViewerProfile = cache(
  async (): Promise<ActiveViewerProfile | null> => {
    try {
      const { userId } = await auth()
      if (!userId) return null

      let cookieId = ""
      try {
        const store = await cookies()
        cookieId = store.get(ACTIVE_PROFILE_COOKIE)?.value?.trim() ?? ""
      } catch {
        // No request scope (e.g. build-time render) — fall back to the first profile.
      }

      try {
        await connectDB()
      } catch {
        return null
      }

      const account = await VisionProfile.findOne({ authUserId: userId })
        .select({ viewerProfiles: 1 })
        .lean<{ viewerProfiles?: { id?: string; name?: string; isKid?: boolean }[] }>()
      const viewerProfiles = account?.viewerProfiles ?? []
      if (viewerProfiles.length === 0) return null

      const cookieIndex = cookieId
        ? viewerProfiles.findIndex((p) => p?.id === cookieId)
        : -1
      const index = cookieIndex >= 0 ? cookieIndex : 0
      const match = viewerProfiles[index]
      if (!match?.id) return null

      return {
        id: match.id,
        name: typeof match.name === "string" ? match.name : "Viewer",
        isKid: Boolean(match.isKid),
        isPrimary: index === 0,
      }
    } catch (error) {
      console.warn("[vision/active-profile] resolution failed", error)
      return null
    }
  },
)

/**
 * Mongo filter fragment scoping `vision_watch_progress` reads to the active
 * viewer profile. Legacy rows (profileId missing or "", written before
 * per-profile history) stay visible ONLY on the account's primary profile so
 * old history never leaks into kids profiles. With no resolvable profile the
 * legacy account-wide behavior is kept (no filter).
 */
export function watchProgressProfileFilter(
  profile: ActiveViewerProfile | null,
): Record<string, unknown> {
  if (!profile) return {}
  if (profile.isPrimary) {
    // `$in: [null, ""]` matches both a missing field and an empty string.
    return { $or: [{ profileId: profile.id }, { profileId: { $in: [null, ""] } }] }
  }
  return { profileId: profile.id }
}
