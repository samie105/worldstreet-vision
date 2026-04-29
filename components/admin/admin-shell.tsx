"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare01Icon,
  Video01Icon,
  CloudUploadIcon,
  Compass01Icon,
  Settings01Icon,
  ArrowLeft01Icon,
} from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import type { VisionAuthUser } from "@/lib/auth/clerk"

const ADMIN_LINKS = [
  { label: "Overview", href: "/admin", icon: DashboardSquare01Icon },
  { label: "Catalog", href: "/admin/catalog", icon: Video01Icon },
  { label: "Uploads", href: "/admin/uploads", icon: CloudUploadIcon },
  { label: "Rails", href: "/admin/rails", icon: Compass01Icon },
  { label: "Settings", href: "/admin/settings", icon: Settings01Icon },
] as const

export function AdminShell({
  user,
  children,
}: {
  user: VisionAuthUser
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[240px_1fr]">
      <aside className="hidden border-r border-border/60 bg-card/50 md:flex md:flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 p-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Worldstreet
            </p>
            <p className="text-sm font-semibold">Vision Admin</p>
          </div>
          <Link
            href="/"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Back to app"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          </Link>
        </div>
        <nav className="flex-1 p-2">
          <ul className="flex flex-col gap-0.5">
            {ADMIN_LINKS.map((link) => {
              const isActive =
                link.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === link.href || pathname.startsWith(`${link.href}/`)
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-primary/15 text-primary"
                        : "text-foreground/75 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <HugeiconsIcon icon={link.icon} strokeWidth={2} className="size-4" />
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="border-t border-border/60 p-3 text-xs text-muted-foreground">
          Signed in as
          <p className="truncate text-sm font-medium text-foreground">{user.email}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur md:px-8">
          <h1 className="text-base font-semibold">{currentPageLabel(pathname)}</h1>
        </header>
        <div className="flex-1 overflow-auto px-4 py-6 md:px-8">{children}</div>
      </div>
    </div>
  )
}

function currentPageLabel(pathname: string): string {
  const match = ADMIN_LINKS.find((link) =>
    link.href === "/admin"
      ? pathname === "/admin"
      : pathname === link.href || pathname.startsWith(`${link.href}/`),
  )
  return match?.label ?? "Admin"
}
