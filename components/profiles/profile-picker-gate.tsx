"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { ViewerProfilesProvider, useViewerProfiles } from "@/lib/profiles/store"
import { ProfilePicker } from "@/components/profiles/profile-picker"

const HIDE_ON_PATHS = ["/login", "/register", "/invite", "/admin", "/watch"]

export function ProfilePickerGate({ children }: { children: React.ReactNode }) {
  return (
    <ViewerProfilesProvider>
      <Inner>{children}</Inner>
    </ViewerProfilesProvider>
  )
}

function Inner({ children }: { children: React.ReactNode }) {
  const { hasChosen } = useViewerProfiles()
  const pathname = usePathname()
  const skip = HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (skip) return <>{children}</>
  if (hasChosen) return <>{children}</>
  return <ProfilePicker />
}
