import { connectDB } from "@/lib/db/mongodb"
import VisionAsset from "@/models/VisionAsset"
import { serializeAsset } from "@/lib/catalog/serializers"
import { Badge } from "@/components/ui/badge"
import { formatDuration, relativeTime } from "@/lib/utils"

export const dynamic = "force-dynamic"

async function loadAssets() {
  await connectDB()
  const docs = await VisionAsset.find({}).sort({ updatedAt: -1 }).limit(200)
  return docs.map(serializeAsset)
}

export default async function AdminUploadsPage() {
  const assets = await loadAssets()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Track every upload as Cloudflare Stream processes it. Webhooks update these statuses automatically.
      </p>
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
                  No assets uploaded yet.
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
