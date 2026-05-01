"use server"

import { auth, currentUser } from "@/lib/auth/runtime"
import { isDevAuthBypassEnabled, DEV_AUTH_USER } from "@/lib/auth/dev-bypass"
import { connectDB } from "@/lib/db/mongodb"
import VisionProfile, { type IVisionProfile } from "@/models/VisionProfile"

export interface VisionViewerProfileData {
  id: string
  name: string
  avatarColor: string
  avatarImageUrl: string
  isKid: boolean
  preferences?: {
    autoplayPreviews?: boolean
    captionsByDefault?: boolean
  }
}

export interface VisionProfileData {
  _id: string
  authUserId: string
  email: string
  displayName: string
  avatarUrl: string
  preferences: IVisionProfile["preferences"]
  myList: string[]
  recentlyViewed: string[]
  viewerProfiles: VisionViewerProfileData[]
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
    viewerProfiles: [],
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
    viewerProfiles: Array.isArray(obj.viewerProfiles)
      ? (obj.viewerProfiles as unknown[]).map((entry) => normalizeViewerProfile(entry))
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

/**
 * Idempotently create the Mongo profile for a real Clerk user. Used on the
 * watch-party invite flow so first-time joiners have a display name + avatar
 * in presence and live chat right away. Safe to call repeatedly: existing
 * profiles are returned untouched.
 */
export async function ensureProfileForUser(viewer: {
  userId: string
  email: string
  firstName: string
  lastName: string
  imageUrl: string
}): Promise<VisionProfileData | null> {
  if (!viewer?.userId) return null
  try {
    await connectDB()
  } catch {
    return null
  }
  const existing = await VisionProfile.findOne({ authUserId: viewer.userId })
  if (existing) return toPlain(existing)
  try {
    const created = await VisionProfile.create({
      authUserId: viewer.userId,
      email: viewer.email || `${viewer.userId}@vision.local`,
      displayName:
        `${viewer.firstName} ${viewer.lastName}`.trim() || viewer.email || "Viewer",
      avatarUrl: viewer.imageUrl ?? "",
    })
    return toPlain(created)
  } catch (error) {
    // Most likely a unique-key race \u2014 re-fetch and return whatever exists.
    console.warn("[vision/ensureProfileForUser] create failed", error)
    const fallback = await VisionProfile.findOne({ authUserId: viewer.userId })
    return fallback ? toPlain(fallback) : null
  }
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

function normalizeViewerProfile(raw: unknown): VisionViewerProfileData {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    id: typeof r.id === "string" && r.id.length > 0 ? r.id : `vp-${Math.random().toString(36).slice(2, 9)}`,
    name: typeof r.name === "string" ? r.name : "Viewer",
    avatarColor: typeof r.avatarColor === "string" ? r.avatarColor : "#171717",
    avatarImageUrl: typeof r.avatarImageUrl === "string" ? r.avatarImageUrl : "",
    isKid: Boolean(r.isKid),
    preferences:
      r.preferences && typeof r.preferences === "object"
        ? (r.preferences as VisionViewerProfileData["preferences"])
        : undefined,
  }
}

export interface ViewerProfilesResult {
  success: boolean
  viewerProfiles?: VisionViewerProfileData[]
  /** Real display name from the Clerk / Mongo account (used to seed the first profile). */
  accountName?: string
  /** Clerk profile photo URL for the account holder. */
  accountAvatarUrl?: string
  error?: string
}

const MAX_VIEWER_PROFILES = 5

/**
 * Returns the persisted viewer profiles for the signed-in account. Falls back
 * to an empty array if Mongo is unavailable in dev (the client provider seeds
 * defaults locally).
 */
export async function getViewerProfiles(): Promise<ViewerProfilesResult> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: "Unauthorized" }

    try {
      await connectDB()
    } catch {
      if (isDevAuthBypassEnabled()) {
        return { success: true, viewerProfiles: getDevProfile().viewerProfiles }
      }
      return { success: false, error: "Database unavailable" }
    }

    const existing = await VisionProfile.findOne({ authUserId: userId })
    if (!existing) return { success: true, viewerProfiles: [] }
    const plain = toPlain(existing)
    return {
      success: true,
      viewerProfiles: plain.viewerProfiles,
      accountName: plain.displayName || undefined,
      accountAvatarUrl: plain.avatarUrl || undefined,
    }
  } catch (error) {
    console.error("[vision/getViewerProfiles] error", error)
    return { success: false, error: "Internal server error" }
  }
}

/**
 * Inserts a new viewer sub-profile or updates an existing one (matched by `id`).
 * Caps the total at `MAX_VIEWER_PROFILES`.
 */
export async function upsertViewerProfile(
  input: VisionViewerProfileData,
): Promise<ViewerProfilesResult> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: "Unauthorized" }

    const next = normalizeViewerProfile(input)

    try {
      await connectDB()
    } catch {
      if (isDevAuthBypassEnabled()) {
        const current = getDevProfile()
        const updated = mergeViewer(current.viewerProfiles, next)
        if (updated === null) return { success: false, error: "Profile cap reached" }
        setDevProfile({
          ...current,
          viewerProfiles: updated,
          updatedAt: new Date().toISOString(),
        })
        return { success: true, viewerProfiles: updated }
      }
      return { success: false, error: "Database unavailable" }
    }

    const profile = await VisionProfile.findOne({ authUserId: userId })
    if (!profile) return { success: false, error: "Profile not found" }

    const merged = mergeViewer(toPlain(profile).viewerProfiles, next)
    if (merged === null) return { success: false, error: "Profile cap reached" }

    profile.viewerProfiles = merged as unknown as IVisionProfile["viewerProfiles"]
    await profile.save()
    return { success: true, viewerProfiles: toPlain(profile).viewerProfiles }
  } catch (error) {
    console.error("[vision/upsertViewerProfile] error", error)
    return { success: false, error: "Internal server error" }
  }
}

export async function deleteViewerProfile(
  id: string,
): Promise<ViewerProfilesResult> {
  try {
    const { userId } = await auth()
    if (!userId) return { success: false, error: "Unauthorized" }
    if (!id) return { success: false, error: "Missing id" }

    try {
      await connectDB()
    } catch {
      if (isDevAuthBypassEnabled()) {
        const current = getDevProfile()
        const next = current.viewerProfiles.filter((p) => p.id !== id)
        setDevProfile({ ...current, viewerProfiles: next, updatedAt: new Date().toISOString() })
        return { success: true, viewerProfiles: next }
      }
      return { success: false, error: "Database unavailable" }
    }

    const profile = await VisionProfile.findOne({ authUserId: userId })
    if (!profile) return { success: false, error: "Profile not found" }

    profile.viewerProfiles = profile.viewerProfiles.filter(
      (p) => p.id !== id,
    ) as unknown as IVisionProfile["viewerProfiles"]
    await profile.save()
    return { success: true, viewerProfiles: toPlain(profile).viewerProfiles }
  } catch (error) {
    console.error("[vision/deleteViewerProfile] error", error)
    return { success: false, error: "Internal server error" }
  }
}

function mergeViewer(
  list: VisionViewerProfileData[],
  next: VisionViewerProfileData,
): VisionViewerProfileData[] | null {
  const idx = list.findIndex((p) => p.id === next.id)
  if (idx >= 0) {
    const copy = list.slice()
    copy[idx] = { ...list[idx], ...next }
    return copy
  }
  if (list.length >= MAX_VIEWER_PROFILES) return null
  return [...list, next]
}
