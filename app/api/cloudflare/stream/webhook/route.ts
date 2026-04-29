import { NextResponse } from "next/server"

import { connectDB } from "@/lib/db/mongodb"
import { RateLimitError, rateLimit } from "@/lib/rate-limit"
import { verifyCloudflareStreamWebhook } from "@/lib/video/cloudflare-stream"
import VisionAsset from "@/models/VisionAsset"

export const runtime = "nodejs"

interface CloudflareStreamWebhook {
  uid?: string
  readyToStream?: boolean
  status?: {
    state?: string
    errorReasonText?: string
  }
  duration?: number
  input?: {
    width?: number
    height?: number
  }
}

export async function POST(req: Request) {
  try {
    rateLimit({ identifier: "cloudflare-stream-webhook", limit: 60, windowMs: 60_000 })
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }
    throw error
  }

  const rawBody = await req.text()
  const signature = req.headers.get("webhook-signature")

  if (!verifyCloudflareStreamWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: CloudflareStreamWebhook
  try {
    event = JSON.parse(rawBody) as CloudflareStreamWebhook
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!event.uid) {
    return NextResponse.json({ ok: true })
  }

  const status = event.readyToStream
    ? "ready"
    : event.status?.state === "error"
      ? "errored"
      : "preparing"

  await connectDB()
  await VisionAsset.findOneAndUpdate(
    { cloudflareVideoUid: event.uid },
    {
      $set: {
        status,
        durationSeconds: Math.round(event.duration ?? 0),
        aspectRatio: aspectRatio(event.input?.width, event.input?.height),
        errorMessage: event.status?.errorReasonText ?? "",
      },
    },
  )

  return NextResponse.json({ ok: true })
}

function aspectRatio(width?: number, height?: number): string {
  if (!width || !height) return "16:9"
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}
