import { NextResponse } from "next/server"

import { getAuthUser } from "@/lib/auth/clerk"
import { getAssetById } from "@/lib/catalog/queries"
import { signCloudflarePlayback } from "@/lib/video/cloudflare-stream"

interface Params {
  params: Promise<{ assetId: string }>
}

export async function GET(_req: Request, { params }: Params) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { assetId } = await params
  const asset = await getAssetById(assetId)
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  if (asset.status !== "ready" || !asset.cloudflareVideoUid) {
    return NextResponse.json({ error: "Asset not ready" }, { status: 409 })
  }

  try {
    const bundle = signCloudflarePlayback(asset.cloudflareVideoUid, asset.signed)
    return NextResponse.json({
      assetId: asset._id,
      titleId: asset.titleId,
      kind: asset.kind,
      durationSeconds: asset.durationSeconds,
      aspectRatio: asset.aspectRatio,
      captions: asset.captions,
      ...bundle,
    })
  } catch (error) {
    console.error("[vision/playback]", error)
    return NextResponse.json({ error: "Failed to sign playback" }, { status: 500 })
  }
}
