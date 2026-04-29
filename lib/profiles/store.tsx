"use client"

import * as React from "react"

import { PROFILE_ART_IMAGES, profileArtForId } from "@/lib/profiles/avatar-art"

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

const STORAGE_KEY = "vision/viewer-profiles"
const ACTIVE_KEY = "vision/active-profile"

const DEFAULT_PROFILES: VisionViewerProfile[] = [
  {
    id: "richie",
    name: "Richie",
    avatarColor: "#1c1917",
    avatarImageUrl: PROFILE_ART_IMAGES[0]!,
    isKid: false,
  },
  {
    id: "ava",
    name: "Ava",
    avatarColor: "#1c1917",
    avatarImageUrl: PROFILE_ART_IMAGES[2]!,
    isKid: false,
  },
  {
    id: "kids",
    name: "Kids",
    avatarColor: "#14532d",
    avatarImageUrl: PROFILE_ART_IMAGES[4]!,
    isKid: true,
  },
]

interface ProfilesContextValue {
  profiles: VisionViewerProfile[]
  activeProfileId: string | null
  activeProfile: VisionViewerProfile | null
  hasChosen: boolean
  selectProfile: (id: string) => void
  clearActive: () => void
  addProfile: (input: Omit<VisionViewerProfile, "id">) => VisionViewerProfile
  updateProfile: (id: string, updates: Partial<VisionViewerProfile>) => void
  removeProfile: (id: string) => void
}

const ProfilesContext = React.createContext<ProfilesContextValue | null>(null)

export function useViewerProfiles() {
  const ctx = React.useContext(ProfilesContext)
  if (!ctx) throw new Error("useViewerProfiles must be used inside <ProfilesProvider>")
  return ctx
}

export function ViewerProfilesProvider({ children }: { children: React.ReactNode }) {
  const [profiles, setProfiles] = React.useState<VisionViewerProfile[]>(DEFAULT_PROFILES)
  const [activeProfileId, setActiveProfileId] = React.useState<string | null>(null)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    // Defer reads via setTimeout so we don't fire setState synchronously during
    // React's commit phase (otherwise the linter — and React — flags cascading
    // renders).
    const id = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as unknown
          if (Array.isArray(parsed) && parsed.length > 0) {
            const normalized = parsed
              .map(normalizeStoredProfile)
              .filter((v): v is VisionViewerProfile => v !== null)
            if (normalized.length > 0) setProfiles(normalized)
          }
        }
        const active = window.localStorage.getItem(ACTIVE_KEY)
        if (active) setActiveProfileId(active)
      } catch {
        // ignore
      }
      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
  }, [profiles, hydrated])

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

  const addProfile = React.useCallback((input: Omit<VisionViewerProfile, "id">) => {
    const id = `profile-${Math.random().toString(36).slice(2, 9)}`
    const next: VisionViewerProfile = { id, ...input }
    setProfiles((prev) => [...prev, next])
    return next
  }, [])

  const updateProfile = React.useCallback(
    (id: string, updates: Partial<VisionViewerProfile>) => {
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
    },
    [],
  )

  const removeProfile = React.useCallback((id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id))
    setActiveProfileId((current) => (current === id ? null : current))
  }, [])

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
      selectProfile,
      clearActive,
      addProfile,
      updateProfile,
      removeProfile,
    ],
  )

  return <ProfilesContext.Provider value={value}>{children}</ProfilesContext.Provider>
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
