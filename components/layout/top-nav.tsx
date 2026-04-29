"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  HomeIcon,
  Compass01Icon,
  Bookmark01Icon,
  UserMultipleIcon,
  Settings01Icon,
  Logout01Icon,
  Moon02Icon,
  Sun03Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useAuth } from "@/components/auth-provider"
import { useProfile } from "@/components/profile-provider"
import { useViewerProfiles } from "@/lib/profiles/store"
import { ProfileSwitcher } from "@/components/profiles/profile-switcher"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { SearchPalette } from "@/components/catalog/search-palette"
import type { CatalogTitle } from "@/lib/catalog/types"

const NAV_LINKS = [
  { name: "Home", href: "/", icon: HomeIcon },
  { name: "Browse", href: "/browse", icon: Compass01Icon },
  { name: "My List", href: "/my-list", icon: Bookmark01Icon },
  { name: "Watch Together", href: "/watch-together", icon: UserMultipleIcon },
] as const

interface TopNavProps {
  recommendations?: CatalogTitle[]
}

export function TopNav({ recommendations = [] }: TopNavProps) {
  const pathname = usePathname()
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const { activeProfile } = useViewerProfiles()
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      data-testid="top-nav"
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-all duration-300",
        scrolled
          ? "bg-background/85 backdrop-blur-xl border-b border-border/60"
          : "bg-gradient-to-b from-black/65 via-black/30 to-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 md:h-16 md:px-12">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <Image
            src="/worldstreet-logo/WorldStreet1x.png"
            alt="Worldstreet"
            width={28}
            height={28}
            className="size-6 object-contain"
            priority
            unoptimized
          />
          <span className="text-sm font-semibold tracking-tight text-white drop-shadow-sm md:text-base">
            Worldstreet <span className="text-primary">Vision</span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center md:flex">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <Link
                key={link.href}
                href={link.href}
                data-testid={`nav-${link.name.toLowerCase().replace(/\s+/g, "-")}`}
                className={cn(
                  "relative px-3 py-1.5 text-[13px] font-medium transition-colors rounded-md",
                  isActive
                    ? "text-foreground"
                    : "text-foreground/65 hover:text-foreground",
                )}
              >
                {link.name}
                {isActive ? (
                  <motion.span
                    layoutId="nav-active-pill"
                    className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 320, damping: 32 }}
                  />
                ) : null}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <SearchPalette className="hidden sm:block" />
          <Link
            href="/search"
            aria-label="Search"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/85 hover:bg-accent sm:hidden"
          >
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4" />
          </Link>
          <ThemeToggle />
          <NotificationBell recommendations={recommendations} />

          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-sm" className="rounded-full" />
              }
            >
              {activeProfile ? (
                <span
                  className="relative flex size-7 overflow-hidden rounded-md"
                  style={{ background: activeProfile.avatarColor }}
                  aria-hidden
                >
                  <Image
                    src={activeProfile.avatarImageUrl}
                    alt=""
                    fill
                    sizes="28px"
                    className="object-cover"
                  />
                </span>
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {(profile?.displayName ?? user?.firstName ?? "U").slice(0, 1).toUpperCase()}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
                <span
                  className="relative flex size-9 overflow-hidden rounded-md"
                  style={{ background: activeProfile?.avatarColor ?? "#404040" }}
                  aria-hidden
                >
                  {activeProfile?.avatarImageUrl ? (
                    <Image
                      src={activeProfile.avatarImageUrl}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-cover"
                    />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {activeProfile?.name ?? profile?.displayName ?? user?.firstName ?? "Member"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <ProfileSwitcher />
              <div className="border-t border-border/40 px-1 py-1">
                <PopoverNavLink href="/my-list" icon={Bookmark01Icon} label="My List" />
                <PopoverNavLink
                  href="/watch-together"
                  icon={UserMultipleIcon}
                  label="Watch Together"
                />
                <PopoverNavLink href="/settings" icon={Settings01Icon} label="Settings" />
                <button
                  onClick={() => signOut()}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
                >
                  <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} className="size-4" />
                  Sign out
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <MobileNav pathname={pathname} />
    </header>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme !== "light"

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="rounded-full"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      data-testid="theme-toggle"
    >
      <HugeiconsIcon icon={isDark ? Sun03Icon : Moon02Icon} strokeWidth={2} />
    </Button>
  )
}

function PopoverNavLink({
  href,
  icon,
  label,
}: {
  href: string
  icon: typeof HomeIcon
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-accent hover:text-foreground"
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
      {label}
    </Link>
  )
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <nav className="safe-area-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 backdrop-blur-xl md:hidden">
      <div className="mx-auto flex max-w-[1600px] items-stretch justify-around px-2">
        {NAV_LINKS.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname === link.href || pathname.startsWith(`${link.href}/`)
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <HugeiconsIcon
                icon={link.icon}
                strokeWidth={2}
                className={cn("size-5", isActive ? "text-primary" : "text-foreground/70")}
              />
              {link.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
