import "server-only"

import crypto from "node:crypto"

import { env } from "@/lib/env"

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"

interface CloudflareResponse<T> {
  success: boolean
  result: T
  errors?: { message: string }[]
}

interface DirectUploadResult {
  uid: string
  uploadURL: string
}

interface StreamVideoDetails {
  uid: string
  readyToStream: boolean
  status?: {
    state?: string
    errorReasonText?: string
  }
  duration?: number
  input?: {
    width?: number
    height?: number
  }
  thumbnail?: string
}

export interface CloudflarePlaybackResult {
  videoUid: string
  token: string
  signed: boolean
  expiresAt: number
  hlsUrl: string
  posterUrl: string
  iframeUrl: string
}

export async function createCloudflareDirectUpload(input: {
  title: string
  requireSignedUrls?: boolean
  maxDurationSeconds?: number
}): Promise<{ videoUid: string; uploadUrl: string }> {
  const expiry = new Date(Date.now() + 1000 * 60 * 60).toISOString()
  const data = await cloudflareFetch<DirectUploadResult>("/stream/direct_upload", {
    method: "POST",
    body: JSON.stringify({
      maxDurationSeconds: input.maxDurationSeconds ?? 60 * 60 * 6,
      requireSignedURLs: input.requireSignedUrls ?? true,
      expiry,
      meta: {
        name: input.title,
        source: "worldstreet-vision",
      },
    }),
  })

  return {
    videoUid: data.uid,
    uploadUrl: data.uploadURL,
  }
}

export async function getCloudflareStreamVideo(uid: string): Promise<StreamVideoDetails> {
  return cloudflareFetch<StreamVideoDetails>(`/stream/${uid}`)
}

/**
 * Cloudflare Stream signed tokens use RS256. The token replaces the video UID
 * in playback URLs, which keeps HLS manifests and thumbnail endpoints private.
 */
export function createCloudflareStreamToken(videoUid: string, expiresInSeconds = 60 * 5): string {
  if (!env.cloudflare.streamSigningKeyId || !env.cloudflare.streamSigningPrivateKey) {
    throw new Error("Cloudflare Stream signing keys are not configured")
  }

  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  const header = {
    alg: "RS256",
    typ: "JWT",
    kid: env.cloudflare.streamSigningKeyId,
  }
  const payload = {
    sub: videoUid,
    kid: env.cloudflare.streamSigningKeyId,
    exp,
  }

  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const privateKey = env.cloudflare.streamSigningPrivateKey.includes("BEGIN")
    ? env.cloudflare.streamSigningPrivateKey
    : Buffer.from(env.cloudflare.streamSigningPrivateKey, "base64").toString("utf-8")

  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey)
  return `${signingInput}.${base64urlBuffer(signature)}`
}

export function signCloudflarePlayback(
  videoUid: string,
  signed = true,
  expiresInSeconds = 60 * 5,
): CloudflarePlaybackResult {
  const token = signed ? createCloudflareStreamToken(videoUid, expiresInSeconds) : videoUid
  const host = env.cloudflare.streamDeliveryHost
  return {
    videoUid,
    token,
    signed,
    expiresAt: Math.floor(Date.now() / 1000) + expiresInSeconds,
    hlsUrl: `https://${host}/${token}/manifest/video.m3u8`,
    posterUrl: `https://${host}/${token}/thumbnails/thumbnail.jpg`,
    iframeUrl: `https://iframe.videodelivery.net/${token}`,
  }
}

export function verifyCloudflareStreamWebhook(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!env.cloudflare.streamWebhookSecret || !signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => kv.split("=")),
  ) as Record<string, string | undefined>
  const time = parts.time
  const sig1 = parts.sig1
  if (!time || !sig1) return false

  const expected = crypto
    .createHmac("sha256", env.cloudflare.streamWebhookSecret)
    .update(`${time}.${rawBody}`)
    .digest("hex")

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig1))
  } catch {
    return false
  }
}

async function cloudflareFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CLOUDFLARE_API_BASE}/accounts/${env.cloudflare.accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.cloudflare.apiToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })
  const data = (await res.json()) as CloudflareResponse<T>
  if (!res.ok || !data.success) {
    const message = data.errors?.map((e) => e.message).join("; ") || res.statusText
    throw new Error(`Cloudflare Stream API error ${res.status}: ${message}`)
  }
  return data.result
}

function base64url(input: string): string {
  return base64urlBuffer(Buffer.from(input, "utf-8"))
}

function base64urlBuffer(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}
