"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DashboardSquare01Icon,
  Video01Icon,
  CloudUploadIcon,
  Compass01Icon,
  Settings01Icon,
  ArrowLeft01Icon,
  Menu01Icon,
} from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import type { VisionAuthUser } from "@/lib/auth/clerk"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

type NavItem = {
  label: string
  href: string
  icon: typeof DashboardSquare01Icon
}

type NavGroup = { group: string; items: NavItem[] }

/** Catalogue + rails, uploads pipeline, settings — Vision admin IA */
const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    group: "General",
    items: [{ label: "Overview", href: "/admin", icon: DashboardSquare01Icon }],
  },
  {
    group: "Catalogue",
    items: [
      { label: "Catalog", href: "/admin/catalog", icon: Video01Icon },
      { label: "Home rails", href: "/admin/rails", icon: Compass01Icon },
    ],
  },
  {
    group: "Media pipeline",
    items: [{ label: "Uploads", href: "/admin/uploads", icon: CloudUploadIcon }],
  },
  {
    group: "Workspace",
    items: [{ label: "Settings", href: "/admin/settings", icon: Settings01Icon }],
  },
]

const FLAT_NAV = ADMIN_NAV_GROUPS.flatMap((g) => g.items)

function linkIsActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminShell({
  user,
  children,
}: {
  user: VisionAuthUser
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false)

  React.useEffect(() => {
    FLAT_NAV.forEach(({ href }) => router.prefetch(href))
    router.prefetch("/")
  }, [router])

  const displayName =
    `${user.firstName} ${user.lastName}`.trim() || user.email.split("@")[0] || "Admin"

  const NavColumn = ({
    className,
    onNavigate,
  }: {
    className?: string
    onNavigate?: () => void
  }) => (
    <nav className={cn("flex flex-col gap-6", className)}>
      {ADMIN_NAV_GROUPS.map((block) => (
        <div key={block.group}>
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {block.group}
          </p>
          <ul className="flex flex-col gap-0.5">
            {block.items.map((link) => {
              const active = linkIsActive(pathname, link.href)
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-primary/15 font-medium text-primary"
                        : "text-foreground/80 hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <HugeiconsIcon icon={link.icon} strokeWidth={2} className="size-[18px] shrink-0" />
                    {link.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )

  return (
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[260px_1fr]">
      {/* Desktop sidebar */}
      <aside className="relative hidden md:flex md:flex-col border-r border-border/60 bg-card/40">
        <div className="flex items-start justify-between gap-2 border-b border-border/60 p-4">
          <Link href="/admin" className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              WorldStreet
            </p>
            <p className="truncate text-[15px] font-semibold leading-tight tracking-tight">Vision Studio</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Catalog · pipeline · storefront</p>
          </Link>
          <Link
            href="/"
            className="mt-0.5 shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Back to Vision"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavColumn />
        </div>
        <div className="border-t border-border/60 p-4">
          <p className="text-[11px] text-muted-foreground">Signed in</p>
          <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
          <Link
            href="/"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary hover:underline"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-3.5 rotate-180" />
            Viewer app
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-col bg-background md:bg-transparent">
        <header className="sticky top-0 z-30 flex flex-col gap-0 border-b border-border/60 bg-background/95 backdrop-blur-md md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex min-h-[52px] items-center gap-2 px-3 md:gap-4 md:px-0 md:py-4">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-5" />
            </Button>
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetContent side="left" className="w-[min(100%,288px)] p-0 pt-14">
                <SheetTitle className="sr-only">Vision admin navigation</SheetTitle>
                <div className="px-4 pb-6">
                  <p className="mb-6 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Vision Studio
                  </p>
                  <NavColumn onNavigate={() => setMobileNavOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <h1 className="text-base font-semibold tracking-tight md:text-lg">{currentPageLabel(pathname)}</h1>
          </div>
        </header>
        <div className="flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">{children}</div>
      </div>
    </div>
  )
}

function currentPageLabel(pathname: string): string {
  const hit = FLAT_NAV.find((link) =>
    link.href === "/admin" ? pathname === "/admin" : pathname === link.href || pathname.startsWith(`${link.href}/`),
  )
  return hit?.label ?? "Admin"
}
