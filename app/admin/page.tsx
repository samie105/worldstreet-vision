import Link from "next/link"

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
  const stats = await loadStats()

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Library</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Published" value={stats.titles} />
          <Stat label="Drafts" value={stats.drafts} />
          <Stat label="Scheduled" value={stats.scheduled} />
          <Stat label="Total assets" value={stats.assets} />
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Activity</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Stat label="Assets processing" value={stats.processingAssets} />
          <Stat label="Active viewers" value={stats.viewerCount} />
        </div>
      </section>
      <section className="rounded-xl border border-border/60 bg-card p-5">
        <h3 className="text-sm font-semibold">Quick actions</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage Vision content and the home page experience.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/catalog"
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Open catalog
          </Link>
          <Link
            href="/admin/uploads"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Upload media
          </Link>
          <Link
            href="/admin/rails"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Edit home rails
          </Link>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</p>
    </div>
  )
}
