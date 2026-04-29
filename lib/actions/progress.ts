"use server"

import { auth } from "@/lib/auth/runtime"
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"
import { connectDB } from "@/lib/db/mongodb"
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

    await VisionWatchProgress.findOneAndUpdate(
      { authUserId: userId, titleId: input.titleId, assetId: input.assetId },
      {
        $set: {
          positionSeconds: Math.max(0, Math.floor(input.positionSeconds)),
          durationSeconds: Math.max(0, Math.floor(input.durationSeconds)),
          completed,
          lastWatchedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    )

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
