"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatDuration } from "@/lib/utils"
import {
  attachAssetToTitle,
  createCloudflareStreamDirectUpload,
  getAssetProcessingStatus,
} from "@/lib/actions/catalog"
import type { CatalogAsset, CatalogTitle } from "@/lib/catalog/types"

interface TitleAssetsManagerProps {
  title: CatalogTitle
  assets: CatalogAsset[]
}

type SlotKind = "trailer" | "feature"

interface SlotState {
  /** "uploading" while bytes are flowing to Cloudflare; "processing" once Cloudflare is transcoding. */
  phase: "idle" | "uploading" | "processing" | "ready" | "errored"
  /** 0–100 while uploading, null otherwise. */
  progress: number | null
  /** Latest server-reported status when phase === "processing". */
  remoteStatus?: "uploading" | "preparing" | "ready" | "errored"
  message?: string
}

const IDLE_SLOT: SlotState = { phase: "idle", progress: null }

export function TitleAssetsManager({ title, assets }: TitleAssetsManagerProps) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [slots, setSlots] = React.useState<Record<SlotKind, SlotState>>({
    trailer: IDLE_SLOT,
    feature: IDLE_SLOT,
  })

  const setSlot = React.useCallback((kind: SlotKind, next: Partial<SlotState>) => {
    setSlots((prev) => ({ ...prev, [kind]: { ...prev[kind], ...next } }))
  }, [])

  /**
   * After Cloudflare receives the upload the asset is `uploading` → `preparing`
   * → `ready`. Poll the server action until ready (or an error) so the admin
   * gets clear feedback instead of having to refresh the page.
   */
  const pollProcessing = React.useCallback(
    async (kind: SlotKind, assetId: string) => {
      const STARTED_AT = Date.now()
      const MAX_MS = 1000 * 60 * 15 // 15 minutes is plenty for typical movies
      const STEP_MS = 3_000

      while (Date.now() - STARTED_AT < MAX_MS) {
        await new Promise((r) => setTimeout(r, STEP_MS))
        const result = await getAssetProcessingStatus(assetId)
        if (!result.success || !result.data) {
          setSlot(kind, {
            phase: "errored",
            progress: null,
            message: result.error ?? "Lost track of asset",
          })
          return
        }
        const status = result.data.status
        setSlot(kind, { phase: "processing", progress: null, remoteStatus: status })
        if (status === "ready") {
          setSlot(kind, { phase: "ready", progress: null, remoteStatus: status })
          router.refresh()
          // Reset to idle shortly after so the slot returns to its normal look.
          window.setTimeout(() => setSlot(kind, IDLE_SLOT), 1_500)
          return
        }
        if (status === "errored") {
          setSlot(kind, {
            phase: "errored",
            progress: null,
            remoteStatus: status,
            message: result.data.errorMessage || "Cloudflare reported a transcoding error.",
          })
          return
        }
      }
      setSlot(kind, {
        phase: "errored",
        progress: null,
        message: "Still processing after 15 minutes — check Cloudflare Stream.",
      })
    },
    [router, setSlot],
  )

  const handleUpload = React.useCallback(
    async (file: File, kind: SlotKind) => {
      setError(null)
      setSlot(kind, { phase: "uploading", progress: 0, message: undefined })
      try {
        const created = await createCloudflareStreamDirectUpload({ titleId: title._id, kind })
        if (!created.success || !created.data) {
          throw new Error(created.error ?? "Failed to start upload")
        }
        await uploadFileWithProgress(created.data.uploadUrl, file, (value) => {
          setSlot(kind, { progress: value })
        })
        // File is uploaded; immediately attach so the title knows about the asset.
        const attached = await attachAssetToTitle(title._id, created.data.assetId, kind)
        if (!attached.success) {
          throw new Error(attached.error ?? "Failed to link asset")
        }
        setSlot(kind, { phase: "processing", progress: null, remoteStatus: "preparing" })
        // Don't await — let the poll run in the background so the admin can do other work.
        void pollProcessing(kind, created.data.assetId)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed"
        setError(message)
        setSlot(kind, { phase: "errored", progress: null, message })
      }
    },
    [pollProcessing, setSlot, title._id],
  )

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
          slot={slots.trailer}
          onSelect={(file) => handleUpload(file, "trailer")}
        />
        <UploadSlot
          label="Main feature"
          asset={assets.find((a) => a._id === title.mainAssetId)}
          slot={slots.feature}
          onSelect={(file) => handleUpload(file, "feature")}
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
  slot,
  onSelect,
}: {
  label: string
  asset?: CatalogAsset
  slot: SlotState
  onSelect: (file: File) => void
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const isBusy = slot.phase === "uploading" || slot.phase === "processing"
  const buttonLabel =
    slot.phase === "uploading"
      ? "Uploading…"
      : slot.phase === "processing"
        ? "Processing…"
        : asset
          ? "Replace"
          : "Upload"

  const phaseBadge = (() => {
    if (slot.phase === "uploading") return { label: "uploading", tone: "muted" as const }
    if (slot.phase === "processing")
      return { label: slot.remoteStatus ?? "processing", tone: "muted" as const }
    if (slot.phase === "ready") return { label: "ready", tone: "new" as const }
    if (slot.phase === "errored") return { label: "error", tone: "muted" as const }
    if (asset) return { label: asset.status, tone: asset.status === "ready" ? ("new" as const) : ("muted" as const) }
    return null
  })()

  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        {phaseBadge ? <Badge variant={phaseBadge.tone}>{phaseBadge.label}</Badge> : null}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {asset?.cloudflareVideoUid
          ? `Cloudflare UID ${asset.cloudflareVideoUid.slice(0, 8)}…`
          : "No asset attached yet."}
      </p>

      {slot.progress !== null ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-200"
            style={{ width: `${Math.round(slot.progress)}%` }}
          />
        </div>
      ) : null}

      {slot.phase === "processing" ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-primary" />
          Cloudflare is transcoding — usually a minute or two. You can leave this page.
        </div>
      ) : null}

      {slot.phase === "errored" && slot.message ? (
        <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          {slot.message}
        </p>
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
          disabled={isBusy}
          onClick={() => inputRef.current?.click()}
        >
          {buttonLabel}
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
