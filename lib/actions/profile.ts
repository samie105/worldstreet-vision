"use server"

import { auth, currentUser } from "@/lib/auth/runtime"
import { isDevAuthBypassEnabled, DEV_AUTH_USER } from "@/lib/auth/dev-bypass"
import { connectDB } from "@/lib/db/mongodb"
import VisionProfile, { type IVisionProfile } from "@/models/VisionProfile"

export interface VisionProfileData {
  _id: string
  authUserId: string
  email: string
  displayName: string
  avatarUrl: string
  preferences: IVisionProfile["preferences"]
  myList: string[]
  recentlyViewed: string[]
  lastSeen: string
  createdAt: string
  updatedAt: string
}

export interface ProfileResult {
  success: boolean
  profile?: VisionProfileData
  error?: string
}

/**
 * In-memory dev profile cache so tests can mutate state when Mongo is unavailable.
 * Holds the active profile for the dev user keyed by `authUserId`.
 */
const DEV_PROFILES = new Map<string, VisionProfileData>()

function buildDevProfile(): VisionProfileData {
  return {
    _id: "dev-profile-001",
    authUserId: DEV_AUTH_USER.userId,
    email: DEV_AUTH_USER.email,
    displayName: `${DEV_AUTH_USER.firstName} ${DEV_AUTH_USER.lastName}`.trim(),
    avatarUrl: DEV_AUTH_USER.imageUrl,
    preferences: {
      autoplayPreviews: true,
      captionsByDefault: false,
      preferredQuality: "auto",
      maturityRating: "r",
    },
    myList: [],
    recentlyViewed: [],
    lastSeen: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function getDevProfile(): VisionProfileData {
  let profile = DEV_PROFILES.get(DEV_AUTH_USER.userId)
  if (!profile) {
    profile = buildDevProfile()
    DEV_PROFILES.set(DEV_AUTH_USER.userId, profile)
  }
  return profile
}

function setDevProfile(profile: VisionProfileData) {
  DEV_PROFILES.set(profile.authUserId, profile)
}

function toPlain(doc: IVisionProfile): VisionProfileData {
  const obj = doc.toObject ? doc.toObject() : (doc as unknown as Record<string, unknown>)
  return {
    _id: String((obj as { _id: unknown })._id),
    authUserId: String(obj.authUserId),
    email: String(obj.email),
    displayName: String(obj.displayName ?? ""),
    avatarUrl: String(obj.avatarUrl ?? ""),
    preferences: (obj.preferences ?? {
      autoplayPreviews: true,
      captionsByDefault: false,
      preferredQuality: "auto",
      maturityRating: "r",
    }) as VisionProfileData["preferences"],
    myList: Array.isArray(obj.myList) ? (obj.myList as string[]) : [],
    recentlyViewed: Array.isArray(obj.recentlyViewed)
      ? (obj.recentlyViewed as string[])
      : [],
    lastSeen: dateString(obj.lastSeen),
    createdAt: dateString(obj.createdAt),
    updatedAt: dateString(obj.updatedAt),
  }
}

function dateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "string") return value
  return ""
}

export async function fetchProfile(): Promise<ProfileResult> {
  try {
    let userId: string | null = null
    try {
      const result = await auth()
      userId = result.userId
    } catch {
      return { success: false, error: "Unauthorized" }
    }

    if (!userId) return { success: false, error: "Unauthorized" }

    try {
      await connectDB()
    } catch {
      if (isDevAuthBypassEnabled()) {
        return { success: true, profile: getDevProfile() }
      }
      return { success: false, error: "Database unavailable" }
    }

    const existing = await VisionProfile.findOne({ authUserId: userId })
    if (existing) {
      return { success: true, profile: toPlain(existing) }
    }

    let email = ""
    let displayName = ""
    let avatarUrl = ""

    try {
      const clerkUser = await currentUser()
      if (clerkUser) {
        email = clerkUser.emailAddresses[0]?.emailAddress ?? ""
        displayName = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim()
        avatarUrl = clerkUser.imageUrl ?? ""
      }
    } catch (err) {
      console.warn("[vision/fetchProfile] currentUser failed", err)
    }

    if (!email) {
      if (isDevAuthBypassEnabled()) {
        return { success: true, profile: getDevProfile() }
      }
      return { success: false, error: "Missing email on session" }
    }

    const profile = await VisionProfile.create({
      authUserId: userId,
      email,
      displayName,
      avatarUrl,
    })
    return { success: true, profile: toPlain(profile) }
  } catch (error) {
    console.error("[vision/fetchProfile] error", error)
    if (isDevAuthBypassEnabled()) {
      return { success: true, profile: getDevProfile() }
    }
    return { success: false, error: "Internal server error" }
  }
}

export async function updateProfile(
  updates: Partial<{
    displayName: string
    avatarUrl: string
    preferences: Partial<VisionProfileData["preferences"]>
  }>,
): Promise<ProfileResult> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: "Unauthorized" }

    try {
      await connectDB()
    } catch {
      if (isDevAuthBypassEnabled()) {
        const current = getDevProfile()
        const next: VisionProfileData = {
          ...current,
          displayName: updates.displayName ?? current.displayName,
          avatarUrl: updates.avatarUrl ?? current.avatarUrl,
          preferences: {
            ...current.preferences,
            ...(updates.preferences ?? {}),
          },
          updatedAt: new Date().toISOString(),
        }
        setDevProfile(next)
        return { success: true, profile: next }
      }
      return { success: false, error: "Database unavailable" }
    }

    const safe: Record<string, unknown> = {}
    if (updates.displayName !== undefined) safe.displayName = updates.displayName
    if (updates.avatarUrl !== undefined) safe.avatarUrl = updates.avatarUrl
    if (updates.preferences) {
      for (const [key, value] of Object.entries(updates.preferences)) {
        safe[`preferences.${key}`] = value
      }
    }

    if (Object.keys(safe).length === 0) {
      return { success: false, error: "No valid fields to update" }
    }

    const profile = await VisionProfile.findOneAndUpdate(
      { authUserId: userId },
      { $set: safe },
      { new: true, runValidators: true, upsert: isDevAuthBypassEnabled() },
    )

    if (!profile) return { success: false, error: "Profile not found" }
    return { success: true, profile: toPlain(profile) }
  } catch (error) {
    console.error("[vision/updateProfile] error", error)
    return { success: false, error: "Internal server error" }
  }
}

export async function toggleMyList(titleId: string): Promise<ProfileResult> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: "Unauthorized" }
    if (!titleId) return { success: false, error: "Missing titleId" }

    try {
      await connectDB()
    } catch {
      if (isDevAuthBypassEnabled()) {
        const current = getDevProfile()
        const myList = current.myList.includes(titleId)
          ? current.myList.filter((id) => id !== titleId)
          : [...current.myList, titleId]
        const next: VisionProfileData = {
          ...current,
          myList,
          updatedAt: new Date().toISOString(),
        }
        setDevProfile(next)
        return { success: true, profile: next }
      }
      return { success: false, error: "Database unavailable" }
    }

    const existing = await VisionProfile.findOne({ authUserId: userId })
    if (!existing) {
      if (isDevAuthBypassEnabled()) {
        return toggleListInDevCache(titleId)
      }
      return { success: false, error: "Profile not found" }
    }

    const isInList = existing.myList.includes(titleId)
    const update = isInList
      ? { $pull: { myList: titleId } }
      : { $addToSet: { myList: titleId } }

    const profile = await VisionProfile.findOneAndUpdate({ authUserId: userId }, update, {
      new: true,
    })
    if (!profile) return { success: false, error: "Profile not found" }
    return { success: true, profile: toPlain(profile) }
  } catch (error) {
    console.error("[vision/toggleMyList] error", error)
    return { success: false, error: "Internal server error" }
  }
}

function toggleListInDevCache(titleId: string): ProfileResult {
  const current = getDevProfile()
  const myList = current.myList.includes(titleId)
    ? current.myList.filter((id) => id !== titleId)
    : [...current.myList, titleId]
  const next: VisionProfileData = {
    ...current,
    myList,
    updatedAt: new Date().toISOString(),
  }
  setDevProfile(next)
  return { success: true, profile: next }
}
