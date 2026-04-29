"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"

import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"
import { useAuth } from "@/components/auth-provider"

const PUBLIC_ROUTES = ["/login", "/register", "/invite", "/profiles"]
const LOGIN_URL =
  process.env.NODE_ENV === "production"
    ? "https://www.worldstreetgold.com/login"
    : "/login"

export function AuthGate({ children }: { children: React.ReactNode }) {
  if (isDevAuthBypassEnabled()) {
    return <>{children}</>
  }
  return <ClerkAuthGate>{children}</ClerkAuthGate>
}

function ClerkAuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r))

  React.useEffect(() => {
    if (!isPublic && isLoaded && !isSignedIn) {
      router.replace(LOGIN_URL)
    }
  }, [isLoaded, isPublic, isSignedIn, router])

  if (isPublic) {
    return <>{children}</>
  }

  if (!isLoaded) {
    return <AuthLoadingState label="Verifying identity…" />
  }

  if (!isSignedIn) {
    return <AuthLoadingState label="Redirecting to login…" />
  }

  return <>{children}</>
}

function AuthLoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center animate-in fade-in">
        <div className="mx-auto mb-4 size-10 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
