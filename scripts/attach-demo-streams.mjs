/**
 * Give every catalogue title something to play.
 *
 * The OMDb seed brings real metadata and real poster art but no video — those
 * titles land with `mainAssetId: null`, so their Play button resolves to a bare
 * `/watch/` and nothing happens. This attaches the same demo streams migration
 * 001 uses (a feature + a trailer per title) so the whole catalogue is
 * stream-testable end to end.
 *
 * Idempotent: assets are upserted by externalId, and a title that already has
 * a main asset is left completely alone — real Cloudflare wiring is never
 * overwritten.
 *
 *   node scripts/attach-demo-streams.mjs [--dry-run]
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import mongoose from "mongoose"

// Same env loading as migrations/001-seed-catalog.mjs.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DRY = process.argv.includes("--dry-run")

// Same public test streams migration 001 seeds with.
const DEMO_HLS_URL =
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8"
const PREVIEW_CLIPS = [
  "https://stream.mux.com/maMTVpEJoljJBFAlTMYoOJB1Z8c2aWqAh7tzWgi9202FU.m3u8",
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
]

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME || "user-account"
if (!uri) throw new Error("MONGODB_URI missing")

await mongoose.connect(uri, dbName ? { dbName } : undefined)
const db = mongoose.connection.db
const Titles = db.collection("vision_titles")
const Assets = db.collection("vision_assets")

const pending = await Titles.find({
  $or: [{ mainAssetId: null }, { mainAssetId: { $exists: false } }],
}).toArray()

console.log(`${pending.length} title(s) without a playable asset${DRY ? " (dry run)" : ""}`)

let features = 0
let trailers = 0
let linked = 0

for (const [i, title] of pending.entries()) {
  const featureExternalId = `feature-${title.slug}`
  const trailerExternalId = `trailer-${title.slug}`
  const preview = PREVIEW_CLIPS[i % PREVIEW_CLIPS.length]
  const now = new Date()

  const base = {
    titleId: String(title._id),
    status: "ready",
    cloudflareVideoUid: null,
    signed: false,
    aspectRatio: "16:9",
    posterTimeSeconds: 5,
    captions: [],
    uploadedBy: "demo-stream-script",
    demoPosterUrl: title.posterUrl ?? "",
    updatedAt: now,
  }

  if (DRY) {
    console.log(`  would attach → ${title.slug}`)
    continue
  }

  await Assets.updateOne(
    { externalId: featureExternalId },
    {
      $set: {
        ...base,
        kind: "feature",
        durationSeconds: title.durationSeconds || 7_200,
        demoPlaybackUrl: DEMO_HLS_URL,
      },
      $setOnInsert: { externalId: featureExternalId, createdAt: now },
    },
    { upsert: true },
  )
  features += 1

  await Assets.updateOne(
    { externalId: trailerExternalId },
    {
      $set: {
        ...base,
        kind: "trailer",
        durationSeconds: 90,
        demoPlaybackUrl: preview,
      },
      $setOnInsert: { externalId: trailerExternalId, createdAt: now },
    },
    { upsert: true },
  )
  trailers += 1

  const feature = await Assets.findOne({ externalId: featureExternalId }, { projection: { _id: 1 } })
  const trailer = await Assets.findOne({ externalId: trailerExternalId }, { projection: { _id: 1 } })

  await Titles.updateOne(
    { _id: title._id },
    {
      $set: {
        mainAssetId: String(feature._id),
        trailerAssetId: String(trailer._id),
        // Drives the hero panel's ambient trailer playback.
        previewClipUrl: preview,
        updatedAt: now,
      },
    },
  )
  linked += 1
}

const remaining = await Titles.countDocuments({
  $or: [{ mainAssetId: null }, { mainAssetId: { $exists: false } }],
})

console.log(
  JSON.stringify(
    { featuresUpserted: features, trailersUpserted: trailers, titlesLinked: linked, stillUnplayable: remaining },
    null,
    1,
  ),
)

await mongoose.disconnect()
