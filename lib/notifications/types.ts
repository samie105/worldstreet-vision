import type { CatalogTitle } from "@/lib/catalog/types"

export type VisionNotificationKind =
  | "recommendation"
  | "new-release"
  | "watch-party"
  | "system"
  | "continue-watching"

export interface VisionNotification {
  id: string
  kind: VisionNotificationKind
  title: string
  body: string
  createdAt: string
  read: boolean
  /** Card thumbnail used for movie / series notifications. */
  thumbnailUrl?: string
  /** Where clicking the notification should navigate. */
  href?: string
  /** Optional title slug for navigation overrides. */
  titleSlug?: string
  /** Optional decorative tone for the leading icon. */
  tone?: "primary" | "info" | "success" | "warning"
}

export function buildSeedNotifications(titles: CatalogTitle[]): VisionNotification[] {
  if (titles.length === 0) return []
  const featured = titles.slice(0, 6)
  const now = Date.now()
  return [
    {
      id: "n-recommendation-1",
      kind: "recommendation",
      title: `Because you watched ${featured[1]?.title ?? "WorldStreet Originals"}`,
      body: `${featured[0]?.title ?? "Golden Hour Protocol"} just landed and matches your taste profile.`,
      createdAt: new Date(now - 1_800_000).toISOString(),
      read: false,
      thumbnailUrl: featured[0]?.backdropUrl,
      href: featured[0] ? `/title/${featured[0].slug}` : undefined,
      titleSlug: featured[0]?.slug,
      tone: "primary",
    },
    {
      id: "n-new-release-1",
      kind: "new-release",
      title: "New on Vision",
      body: `${featured[2]?.title ?? "After The Bell"} season 2 is now streaming.`,
      createdAt: new Date(now - 3_600_000 * 4).toISOString(),
      read: false,
      thumbnailUrl: featured[2]?.backdropUrl,
      href: featured[2] ? `/title/${featured[2].slug}` : undefined,
      titleSlug: featured[2]?.slug,
      tone: "success",
    },
    {
      id: "n-continue-watching-1",
      kind: "continue-watching",
      title: "Pick up where you left off",
      body: `You're 18 minutes into ${featured[3]?.title ?? "Saffron Skies"}. Want to keep going?`,
      createdAt: new Date(now - 3_600_000 * 8).toISOString(),
      read: true,
      thumbnailUrl: featured[3]?.backdropUrl,
      href: featured[3] ? `/title/${featured[3].slug}` : undefined,
      titleSlug: featured[3]?.slug,
      tone: "info",
    },
    {
      id: "n-watch-party-1",
      kind: "watch-party",
      title: "Watch party invite",
      body: "Sofia just started a private viewing of Mirror Yacht and tagged you as host.",
      createdAt: new Date(now - 3_600_000 * 18).toISOString(),
      read: false,
      thumbnailUrl: featured[4]?.backdropUrl,
      href: "/watch-together",
      tone: "primary",
    },
    {
      id: "n-recommendation-2",
      kind: "recommendation",
      title: "Trending in finance thrillers",
      body: `${featured[5]?.title ?? "Volatility"} is climbing the charts this week.`,
      createdAt: new Date(now - 3_600_000 * 26).toISOString(),
      read: true,
      thumbnailUrl: featured[5]?.backdropUrl,
      href: featured[5] ? `/title/${featured[5].slug}` : undefined,
      titleSlug: featured[5]?.slug,
      tone: "primary",
    },
    {
      id: "n-system-1",
      kind: "system",
      title: "Vision is now in your living room",
      body: "Cast to Apple TV, Chromecast, or LG webOS from any title page.",
      createdAt: new Date(now - 3_600_000 * 48).toISOString(),
      read: true,
      tone: "info",
    },
  ]
}
