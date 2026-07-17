import { NextResponse } from "next/server"

import { getAuthUser } from "@/lib/auth/clerk"
import { getAssetById, getTitleById } from "@/lib/catalog/queries"
import { isKidSafeTitle } from "@/lib/catalog/maturity"
import { getActiveViewerProfile } from "@/lib/profiles/active-profile"
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

  // Kids enforcement (deep-link protection): refuse to mint playback for
  // non-kid-safe (or unrated/unknown) titles while a kids profile is active.
  const activeProfile = await getActiveViewerProfile()
  if (activeProfile?.isKid) {
    const title = asset.titleId ? await getTitleById(asset.titleId) : null
    if (!isKidSafeTitle(title)) {
      return NextResponse.json(
        { error: "This title is not available on a kids profile" },
        { status: 403 },
      )
    }
  }

  if (asset.status !== "ready" || !asset.cloudflareVideoUid) {
    return NextResponse.json({ error: "Asset not ready" }, { status: 409 })
  }

  try {
    // Match the watch-page TTL so the refreshed token outlives a full playback session.
    const bundle = signCloudflarePlayback(asset.cloudflareVideoUid, asset.signed, 60 * 60 * 6)
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
