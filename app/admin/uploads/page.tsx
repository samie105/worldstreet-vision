import Link from "next/link"

import { connectDB } from "@/lib/db/mongodb"
import VisionAsset from "@/models/VisionAsset"
import { serializeAsset } from "@/lib/catalog/serializers"
import { Badge } from "@/components/ui/badge"
import { cn, formatDuration, relativeTime } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

export const dynamic = "force-dynamic"

async function loadAssets() {
  await connectDB()
  const docs = await VisionAsset.find({}).sort({ updatedAt: -1 }).limit(200)
  return docs.map(serializeAsset)
}

export default async function AdminUploadsPage() {
  const assets = await loadAssets()

  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <div className="rounded-xl border border-border/70 bg-muted/25 p-5">
        <h2 className="text-sm font-semibold text-foreground">Where you actually upload video</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Videos are not uploaded from this screen. Each title owns its trailer and feature: open{" "}
          <strong className="text-foreground">Catalog → a title → Media</strong>. Files go to Cloudflare Stream via a
          direct-upload URL minted by the server, with a progress bar, then webhook updates move assets from uploading →
          ready.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/catalog/new"
            className={cn(buttonVariants({ variant: "default", size: "sm" }), "no-underline")}
          >
            New title & upload
          </Link>
          <Link
            href="/admin/catalog"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "no-underline")}
          >
            Catalog
          </Link>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold">Pipeline overview</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only snapshot of Stream assets linked to Vision. Processing status comes from Stream / webhooks; use this to
          debug stuck ingest.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        <table className="min-w-full divide-y divide-border/60 text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Asset</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Duration</th>
              <th className="px-4 py-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {assets.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No ingest records yet — create a catalog title and upload trailer/feature under{" "}
                  <strong className="text-foreground">Media</strong>.
                </td>
              </tr>
            ) : (
              assets.map((asset) => (
                <tr key={asset._id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium">{asset.kind}</p>
                    <p className="text-xs text-muted-foreground">{asset.externalId}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={asset.status === "ready" ? "new" : asset.status === "errored" ? "destructive" : "muted"}>
                      {asset.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {formatDuration(asset.durationSeconds)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {asset.updatedAt ? relativeTime(asset.updatedAt) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
