"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"
import { TopNav } from "@/components/layout/top-nav"
import type { CatalogTitle } from "@/lib/catalog/types"

const CINEMATIC_PREFIXES = ["/watch"]
const ADMIN_PREFIX = "/admin"
const HIDE_NAV_PREFIXES = ["/login", "/register", "/invite"]

interface LayoutShellProps {
  children: React.ReactNode
  recommendations?: CatalogTitle[]
}

export function LayoutShell({ children, recommendations = [] }: LayoutShellProps) {
  const pathname = usePathname()
  const isAdmin = pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)
  const isCinematic = CINEMATIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
  const hideNav = HIDE_NAV_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (hideNav) {
    return <main className="min-h-dvh bg-background">{children}</main>
  }

  if (isAdmin) {
    return <div className="min-h-dvh bg-background text-foreground">{children}</div>
  }

  if (isCinematic) {
    return (
      <div className="flex h-dvh flex-col bg-vision-stage text-vision-stage-foreground">
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <TopNav recommendations={recommendations} />
      <main className={cn("min-h-dvh pt-14 pb-20 md:pt-16 md:pb-0")}>{children}</main>
    </div>
  )
}
