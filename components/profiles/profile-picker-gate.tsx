"use client"

import * as React from "react"

import { ViewerProfilesProvider } from "@/lib/profiles/store"

// The "Who's watching?" picker was removed — users go straight to the home
// page. This now only mounts the profiles provider (My List and watch-progress
// are still keyed on the active profile, which the store auto-selects); the
// picker itself lives in settings for anyone who wants to switch or add one.
export function ProfilePickerGate({ children }: { children: React.ReactNode }) {
  return <ViewerProfilesProvider>{children}</ViewerProfilesProvider>
}
