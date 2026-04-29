"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/utils"
import {
  attachAssetToTitle,
  createCloudflareStreamDirectUpload,
} from "@/lib/actions/catalog"
import type { CatalogAsset, CatalogTitle } from "@/lib/catalog/types"

interface TitleAssetsManagerProps {
  title: CatalogTitle
  assets: CatalogAsset[]
}

export function TitleAssetsManager({ title, assets }: TitleAssetsManagerProps) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [progress, setProgress] = React.useState<number | null>(null)

  const handleUpload = async (file: File, kind: "trailer" | "feature") => {
    setError(null)
    setPending(true)
    setProgress(0)
    try {
      const created = await createCloudflareStreamDirectUpload({ titleId: title._id, kind })
      if (!created.success || !created.data) {
        throw new Error(created.error ?? "Failed to start upload")
      }
      await uploadFileWithProgress(created.data.uploadUrl, file, setProgress)
      const attached = await attachAssetToTitle(title._id, created.data.assetId, kind)
      if (!attached.success) {
        throw new Error(attached.error ?? "Failed to link asset")
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setPending(false)
      setProgress(null)
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex flex-col gap-1">
        <h3 className="text-base font-semibold">Media</h3>
        <p className="text-xs text-muted-foreground">
          Upload a trailer and the main feature. Both use Cloudflare Stream signed playback by default.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <UploadSlot
          label="Trailer"
          asset={assets.find((a) => a._id === title.trailerAssetId)}
          onSelect={(file) => handleUpload(file, "trailer")}
          pending={pending}
          progress={progress}
        />
        <UploadSlot
          label="Main feature"
          asset={assets.find((a) => a._id === title.mainAssetId)}
          onSelect={(file) => handleUpload(file, "feature")}
          pending={pending}
          progress={progress}
        />
      </div>

      {error ? (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {assets.length > 0 ? (
        <div className="mt-5">
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            All assets
          </h4>
          <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
            {assets.map((asset) => (
              <li key={asset._id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{asset.kind}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {asset.cloudflareVideoUid ?? "pending"} · {formatDuration(asset.durationSeconds)}
                  </p>
                </div>
                <Badge variant={asset.status === "ready" ? "new" : "muted"}>{asset.status}</Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function UploadSlot({
  label,
  asset,
  pending,
  progress,
  onSelect,
}: {
  label: string
  asset?: CatalogAsset
  pending: boolean
  progress: number | null
  onSelect: (file: File) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        {asset ? (
          <Badge variant={asset.status === "ready" ? "new" : "muted"}>{asset.status}</Badge>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {asset?.cloudflareVideoUid
          ? `Cloudflare UID ${asset.cloudflareVideoUid.slice(0, 8)}…`
          : "No asset attached yet."}
      </p>

      {progress !== null ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.round(progress)}%` }}
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onSelect(file)
            event.target.value = ""
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => inputRef.current?.click()}
        >
          {pending ? "Uploading…" : asset ? "Replace" : "Upload"}
        </Button>
      </div>
    </div>
  )
}

function uploadFileWithProgress(
  url: string,
  file: File,
  onProgress: (value: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", url)
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onProgress((event.loaded / event.total) * 100)
    }
    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${xhr.status})`))
    }
    const form = new FormData()
    form.append("file", file)
    xhr.send(form)
  })
}
