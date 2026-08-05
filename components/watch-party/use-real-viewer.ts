"use client"

import * as React from "react"
import { useUser } from "@clerk/nextjs"

import { useAuth, type AuthUser } from "@/components/auth-provider"

/**
 * Watch parties always need a *real* Clerk identity — the shared dev-auth
 * bypass user would make every browser tab look like the same person and turn
 * every guest into the host. Pull straight from Clerk so each tab gets its own
 * userId; fall back to the in-app AuthProvider only when Clerk isn't signed in
 * (covers local dev without Clerk keys).
 *
 * The server side mirrors this: watch-party actions and the token route use
 * `requireRealAuthUser()` / `getRealAuthUser()`, so the userId here always
 * matches the ids stored in `participants[]` and minted into Ably tokens.
 */
export function useRealViewer(): AuthUser | null {
  const { user: fallbackUser } = useAuth()
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn: clerkSignedIn } = useUser()

  return React.useMemo(() => {
    if (clerkLoaded && clerkSignedIn && clerkUser) {
      return {
        userId: clerkUser.id,
        email: clerkUser.primaryEmailAddress?.emailAddress ?? "",
        firstName: clerkUser.firstName ?? "",
        lastName: clerkUser.lastName ?? "",
        imageUrl: clerkUser.imageUrl ?? "",
        isLoaded: true,
      }
    }
    return fallbackUser
  }, [clerkLoaded, clerkSignedIn, clerkUser, fallbackUser])
}
