import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Tick02Icon,
  FileAttachmentIcon,
  Calendar03Icon,
  VideoReplayIcon,
  Loading03Icon,
  UserMultipleIcon,
  Video01Icon,
  CloudUploadIcon,
  Compass01Icon,
} from "@hugeicons/core-free-icons"

import { getAuthUser } from "@/lib/auth/clerk"
import { connectDB } from "@/lib/db/mongodb"
import VisionAsset from "@/models/VisionAsset"
import VisionTitle from "@/models/VisionTitle"
import VisionWatchProgress from "@/models/VisionWatchProgress"

export const dynamic = "force-dynamic"

async function loadStats() {
  await connectDB()
  const [titles, drafts, scheduled, assets, processingAssets, viewers] = await Promise.all([
    VisionTitle.countDocuments({ status: "published" }),
    VisionTitle.countDocuments({ status: "draft" }),
    VisionTitle.countDocuments({ status: "scheduled" }),
    VisionAsset.countDocuments({}),
    VisionAsset.countDocuments({ status: { $in: ["uploading", "preparing"] } }),
    VisionWatchProgress.distinct("authUserId"),
  ])
  return { titles, drafts, scheduled, assets, processingAssets, viewerCount: viewers.length }
}

export default async function AdminOverviewPage() {
  const [user, stats] = await Promise.all([getAuthUser(), loadStats()])
  const greeting = user?.firstName?.trim() || user?.email?.split("@")[0] || "there"

  const overviewStats = [
    {
      label: "Published titles",
      value: stats.titles,
      hint: "Live in the catalog",
      icon: Tick02Icon,
    },
    {
      label: "Drafts",
      value: stats.drafts,
      hint: "Not yet scheduled",
      icon: FileAttachmentIcon,
    },
    {
      label: "Scheduled",
      value: stats.scheduled,
      hint: "Awaiting publish",
      icon: Calendar03Icon,
    },
    {
      label: "Total assets",
      value: stats.assets,
      hint: "Clips in Stream",
      icon: VideoReplayIcon,
    },
    {
      label: "Pipeline",
      value: stats.processingAssets,
      hint: "Encoding / ingest",
      icon: Loading03Icon,
    },
    {
      label: "Active viewers",
      value: stats.viewerCount,
      hint: "Distinct accounts",
      icon: UserMultipleIcon,
    },
  ] as const

  const quickActions = [
    {
      title: "Catalog",
      description: "Create titles, metadata, thumbnails, maturity",
      href: "/admin/catalog",
      icon: Video01Icon,
      primary: true,
    },
    {
      title: "Uploads",
      description: "Cloudflare ingest status and durations",
      href: "/admin/uploads",
      icon: CloudUploadIcon,
      primary: false,
    },
    {
      title: "Home rails",
      description: "Curate rails on the storefront home page",
      href: "/admin/rails",
      icon: Compass01Icon,
      primary: false,
    },
  ] as const

  return (
    <div className="flex max-w-[1200px] flex-col gap-10">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Welcome back, {greeting}</h2>
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
          Ingest media, polish catalogue rows, and curate home rails—what you publish ships to the Vision
          storefront.
        </p>
      </div>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Library overview
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overviewStats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-start gap-4 rounded-xl border border-border/60 bg-card/80 p-4 shadow-sm shadow-black/2"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <HugeiconsIcon icon={stat.icon} strokeWidth={2} className="size-[18px] text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">{stat.value.toLocaleString()}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{stat.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Typical flow
        </h3>
        <ol className="flex flex-col gap-3 text-sm md:flex-row md:flex-wrap md:gap-x-10 md:gap-y-3">
          {[
            "Upload or link media (Uploads dashboard)",
            "Attach assets to titles in Catalog",
            "Curate storefront rails once titles are published",
          ].map((step, i) => (
            <li key={step} className="flex gap-3 md:items-center">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <span className="text-foreground/90">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Quick actions
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group rounded-xl border border-border/60 bg-card/80 p-5 shadow-sm transition-all hover:border-primary/35 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div
                  className={
                    action.primary
                      ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                      : "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10"
                  }
                >
                  <HugeiconsIcon
                    icon={action.icon}
                    strokeWidth={2}
                    className={action.primary ? "size-[18px]" : "size-[18px] text-primary"}
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold group-hover:text-primary">{action.title}</p>
                  <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{action.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
