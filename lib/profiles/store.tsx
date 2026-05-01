"use client"

import * as React from "react"

import { PROFILE_ART_IMAGES, profileArtForId } from "@/lib/profiles/avatar-art"
import {
  getViewerProfiles as getViewerProfilesAction,
  upsertViewerProfile as upsertViewerProfileAction,
  deleteViewerProfile as deleteViewerProfileAction,
  type VisionViewerProfileData,
} from "@/lib/actions/profile"

export interface VisionViewerProfile {
  id: string
  name: string
  avatarColor: string
  /** Portrait artwork for the profile tile. */
  avatarImageUrl: string
  isKid: boolean
  preferences?: {
    autoplayPreviews: boolean
    captionsByDefault: boolean
  }
}

/** Active-profile selection still lives client-side (per-device choice). */
const ACTIVE_KEY = "vision/active-profile"

interface ProfilesContextValue {
  profiles: VisionViewerProfile[]
  activeProfileId: string | null
  activeProfile: VisionViewerProfile | null
  hasChosen: boolean
  /** True until the first server hydration completes. */
  isHydrating: boolean
  selectProfile: (id: string) => void
  clearActive: () => void
  addProfile: (input: Omit<VisionViewerProfile, "id">) => Promise<VisionViewerProfile | null>
  updateProfile: (id: string, updates: Partial<VisionViewerProfile>) => Promise<void>
  removeProfile: (id: string) => Promise<void>
}

const ProfilesContext = React.createContext<ProfilesContextValue | null>(null)

export function useViewerProfiles() {
  const ctx = React.useContext(ProfilesContext)
  if (!ctx) throw new Error("useViewerProfiles must be used inside <ProfilesProvider>")
  return ctx
}

export function ViewerProfilesProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = React.useState<VisionViewerProfile[]>([])
  const [activeProfileId, setActiveProfileId] = React.useState<string | null>(null)
  const [hydrated, setHydrated] = React.useState(false)
  const [isHydrating, setIsHydrating] = React.useState(true)

  // Step 1: read the locally-cached active profile choice synchronously after mount
  // so the UI doesn't flash to "who's watching?" before the server responds.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const active = window.localStorage.getItem(ACTIVE_KEY)
        if (active) setActiveProfileId(active)
      } catch {
        // ignore
      }
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  // Step 2: pull the canonical list from the database.
  // For a brand-new account (0 viewer profiles), seed exactly one profile
  // using the account holder's real name + Clerk avatar so it matches their
  // actual identity instead of placeholder names.
  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await getViewerProfilesAction()
        if (cancelled) return
        if (res.success && res.viewerProfiles) {
          if (res.viewerProfiles.length > 0) {
            setProfiles(res.viewerProfiles.map(fromServerViewer))
          } else {
            // New account — seed one profile from the real account details.
            const firstName = (res.accountName ?? "").split(" ")[0] || "My Profile"
            const avatarImageUrl =
              res.accountAvatarUrl && /^https?:\/\//.test(res.accountAvatarUrl)
                ? res.accountAvatarUrl
                : PROFILE_ART_IMAGES[0]!
            const initial: VisionViewerProfile = {
              id: `profile-${Math.random().toString(36).slice(2, 9)}`,
              name: firstName,
              avatarColor: "#171717",
              avatarImageUrl,
              isKid: false,
            }
            const seedRes = await upsertViewerProfileAction(toServerViewer(initial))
            if (!cancelled) {
              if (seedRes.success && seedRes.viewerProfiles) {
                setProfiles(seedRes.viewerProfiles.map(fromServerViewer))
              } else {
                setProfiles([initial])
              }
            }
          }
        }
      } catch {
        // Server unreachable — show empty picker so user can still add profiles.
      } finally {
        if (!cancelled) setIsHydrating(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    if (activeProfileId) {
      window.localStorage.setItem(ACTIVE_KEY, activeProfileId)
      document.cookie = `vision_profile=${activeProfileId};path=/;max-age=${60 * 60 * 24 * 30};SameSite=Lax`
    } else {
      window.localStorage.removeItem(ACTIVE_KEY)
      document.cookie = "vision_profile=;path=/;max-age=0;SameSite=Lax"
    }
  }, [activeProfileId, hydrated])

  const selectProfile = React.useCallback((id: string) => setActiveProfileId(id), [])
  const clearActive = React.useCallback(() => setActiveProfileId(null), [])

  const addProfile = React.useCallback(
    async (input: Omit<VisionViewerProfile, "id">): Promise<VisionViewerProfile | null> => {
      const id = `profile-${Math.random().toString(36).slice(2, 9)}`
      const next: VisionViewerProfile = { id, ...input }
      // Optimistic update so the UI feels instant.
      setProfiles((prev) => [...prev, next])
      const res = await upsertViewerProfileAction(toServerViewer(next))
      if (!res.success || !res.viewerProfiles) {
        // Rollback on failure.
        setProfiles((prev) => prev.filter((p) => p.id !== id))
        return null
      }
      setProfiles(res.viewerProfiles.map(fromServerViewer))
      return next
    },
    [],
  )

  const updateProfile = React.useCallback(
    async (id: string, updates: Partial<VisionViewerProfile>): Promise<void> => {
      const previous = profiles
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
      const merged = profiles.find((p) => p.id === id)
      if (!merged) return
      const res = await upsertViewerProfileAction(toServerViewer({ ...merged, ...updates }))
      if (!res.success || !res.viewerProfiles) {
        setProfiles(previous)
        return
      }
      setProfiles(res.viewerProfiles.map(fromServerViewer))
    },
    [profiles],
  )

  const removeProfile = React.useCallback(async (id: string): Promise<void> => {
    const previous = profiles
    setProfiles((prev) => prev.filter((p) => p.id !== id))
    setActiveProfileId((current) => (current === id ? null : current))
    const res = await deleteViewerProfileAction(id)
    if (!res.success) {
      setProfiles(previous)
    } else if (res.viewerProfiles) {
      setProfiles(res.viewerProfiles.map(fromServerViewer))
    }
  }, [profiles])

  const activeProfile = React.useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [profiles, activeProfileId],
  )

  const value = React.useMemo<ProfilesContextValue>(
    () => ({
      profiles,
      activeProfileId,
      activeProfile,
      hasChosen: activeProfileId !== null && hydrated,
      isHydrating,
      selectProfile,
      clearActive,
      addProfile,
      updateProfile,
      removeProfile,
    }),
    [
      profiles,
      activeProfileId,
      activeProfile,
      hydrated,
      isHydrating,
      selectProfile,
      clearActive,
      addProfile,
      updateProfile,
      removeProfile,
    ],
  )

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>
}

function toServerViewer(p: VisionViewerProfile): VisionViewerProfileData {
  return {
    id: p.id,
    name: p.name,
    avatarColor: p.avatarColor,
    avatarImageUrl: p.avatarImageUrl,
    isKid: p.isKid,
    preferences: p.preferences,
  }
}

function fromServerViewer(p: VisionViewerProfileData): VisionViewerProfile {
  const avatarImageUrl =
    typeof p.avatarImageUrl === "string" && /^https?:\/\//.test(p.avatarImageUrl)
      ? p.avatarImageUrl
      : profileArtForId(p.id)
  return {
    id: p.id,
    name: p.name,
    avatarColor: p.avatarColor || "#171717",
    avatarImageUrl,
    isKid: Boolean(p.isKid),
    preferences: p.preferences
      ? {
          autoplayPreviews: p.preferences.autoplayPreviews ?? true,
          captionsByDefault: p.preferences.captionsByDefault ?? false,
        }
      : undefined,
  }
}

function normalizeStoredProfile(raw: unknown): VisionViewerProfile | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== "string" || typeof p.name !== "string") return null
  const isKid = Boolean(p.isKid)
  const avatarColor = typeof p.avatarColor === "string" ? p.avatarColor : "#171717"
  let avatarImageUrl: string
  if (typeof p.avatarImageUrl === "string" && /^https?:\/\//.test(p.avatarImageUrl)) {
    avatarImageUrl = p.avatarImageUrl
  } else {
    avatarImageUrl = profileArtForId(p.id)
  }
  const preferences = p.preferences as VisionViewerProfile["preferences"] | undefined
  return {
    id: p.id,
    name: p.name,
    avatarColor,
    avatarImageUrl,
    isKid,
    preferences,
  }
}
