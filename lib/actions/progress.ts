"use server"

import { auth } from "@/lib/auth/runtime"
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"
import { connectDB } from "@/lib/db/mongodb"
import { getActiveViewerProfile } from "@/lib/profiles/active-profile"
import VisionProfile from "@/models/VisionProfile"
import VisionWatchProgress from "@/models/VisionWatchProgress"

interface SaveProgressInput {
  titleId: string
  assetId: string
  positionSeconds: number
  durationSeconds: number
}

export async function saveWatchProgress(
  input: SaveProgressInput,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: "Unauthorized" }
    if (!input.titleId || !input.assetId) {
      return { success: false, error: "Missing identifiers" }
    }
    try {
      await connectDB()
    } catch {
      if (isDevAuthBypassEnabled()) return { success: true }
      return { success: false, error: "Database unavailable" }
    }

    const completed =
      input.durationSeconds > 0 &&
      input.positionSeconds / input.durationSeconds >= 0.92

    // Scope progress to the active viewer profile. `""` (no resolvable
    // profile) keeps legacy account-level semantics — those rows surface on
    // the primary profile only. The primary profile also ADOPTS matching
    // legacy rows (profileId missing/"") in place instead of creating a
    // duplicate, so stale legacy rows can't resurface in Continue Watching.
    const activeProfile = await getActiveViewerProfile()
    const profileId = activeProfile?.id ?? ""
    const ownsLegacyRows = !activeProfile || activeProfile.isPrimary
    const profileFilter = ownsLegacyRows
      ? { profileId: { $in: [profileId, null, ""] } }
      : { profileId }

    await VisionWatchProgress.findOneAndUpdate(
      {
        authUserId: userId,
        titleId: input.titleId,
        assetId: input.assetId,
        ...profileFilter,
      },
      {
        $set: {
          profileId,
          positionSeconds: Math.max(0, Math.floor(input.positionSeconds)),
          durationSeconds: Math.max(0, Math.floor(input.durationSeconds)),
          completed,
          lastWatchedAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
        setDefaultsOnInsert: true,
        // Deterministically update the freshest row if a stamped row and a
        // legacy row ever coexist for the same title/asset.
        sort: { lastWatchedAt: -1 },
      },
    )

    // NOTE: `recentlyViewed` intentionally stays account-level — it is a flat
    // string[] of titleIds on the account document, so stamping per-profile
    // ids would change its shape for every consumer.
    await VisionProfile.findOneAndUpdate(
      { authUserId: userId },
      {
        $pull: { recentlyViewed: input.titleId },
      },
    )
    await VisionProfile.findOneAndUpdate(
      { authUserId: userId },
      {
        $push: {
          recentlyViewed: { $each: [input.titleId], $position: 0, $slice: 24 },
        },
        $set: { lastSeen: new Date() },
      },
    )

    return { success: true }
  } catch (error) {
    console.error("[vision/saveWatchProgress]", error)
    if (isDevAuthBypassEnabled()) return { success: true }
    return { success: false, error: "Internal server error" }
  }
}

export async function clearWatchProgress(
  titleId: string,
): Promise<{ success: boolean }> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false }
    try {
      await connectDB()
    } catch {
      if (isDevAuthBypassEnabled()) return { success: true }
      return { success: false }
    }
    await VisionWatchProgress.deleteMany({ authUserId: userId, titleId })
    return { success: true }
  } catch {
    return { success: false }
  }
}
