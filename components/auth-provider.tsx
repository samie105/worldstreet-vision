"use client"

import * as React from "react"
import { useUser, useClerk } from "@clerk/nextjs"

import { isDevAuthBypassEnabled, DEV_AUTH_USER } from "@/lib/auth/dev-bypass"
import { useProfile } from "@/components/profile-provider"

export interface AuthUser {
  userId: string
  email: string
  firstName: string
  lastName: string
  imageUrl: string
  isLoaded: boolean
}

interface AuthContextType {
  user: AuthUser | null
  isSignedIn: boolean
  isLoaded: boolean
  signOut: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  isSignedIn: false,
  isLoaded: false,
  signOut: async () => {},
})

export function useAuth() {
  return React.useContext(AuthContext)
}

const SIGN_OUT_URL =
  process.env.NODE_ENV === "production"
    ? "https://www.worldstreetgold.com/login"
    : "/login"

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (isDevAuthBypassEnabled()) {
    return <DevAuthProvider>{children}</DevAuthProvider>
  }
  return <ClerkAuthProvider>{children}</ClerkAuthProvider>
}

function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isSignedIn, isLoaded } = useUser()
  const { signOut: clerkSignOut } = useClerk()
  const { fetchProfile } = useProfile()
  const lastFetchedUserId = React.useRef<string | null>(null)

  const authUser: AuthUser | null = React.useMemo(() => {
    if (!user) return null
    return {
      userId: user.id,
      email: user.primaryEmailAddress?.emailAddress ?? "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      imageUrl: user.imageUrl ?? "",
      isLoaded: true,
    }
  }, [user])

  React.useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn || !user?.id) {
      lastFetchedUserId.current = null
      return
    }
    if (lastFetchedUserId.current !== user.id) {
      lastFetchedUserId.current = user.id
      fetchProfile()
    }
  }, [isLoaded, isSignedIn, user?.id, fetchProfile])

  const signOut = React.useCallback(async () => {
    await clerkSignOut({ redirectUrl: SIGN_OUT_URL })
  }, [clerkSignOut])

  const value = React.useMemo(
    () => ({
      user: authUser,
      isSignedIn: isSignedIn ?? false,
      isLoaded,
      signOut,
    }),
    [authUser, isSignedIn, isLoaded, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchProfile } = useProfile()
  const fetched = React.useRef(false)

  React.useEffect(() => {
    if (fetched.current) return
    fetched.current = true
    fetchProfile()
  }, [fetchProfile])

  const value = React.useMemo(
    () => ({
      user: {
        userId: DEV_AUTH_USER.userId,
        email: DEV_AUTH_USER.email,
        firstName: DEV_AUTH_USER.firstName,
        lastName: DEV_AUTH_USER.lastName,
        imageUrl: DEV_AUTH_USER.imageUrl,
        isLoaded: true,
      },
      isSignedIn: true,
      isLoaded: true,
      signOut: async () => {
        if (typeof window !== "undefined") {
          window.location.href = "/login"
        }
      },
    }),
    [],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
