/**
 * Migration – Per-profile watch history for `vision_watch_progress`.
 *
 * The collection used to enforce a unique index on
 * { authUserId, titleId, assetId }. Watch progress is now scoped per viewer
 * sub-profile, so that index must be replaced with a unique index on
 * { authUserId, profileId, titleId, assetId }. Until this runs, the old index
 * rejects per-profile rows (duplicate key on the same title/asset), so it must
 * be run ONCE at deploy, before (or together with) shipping the app update.
 *
 * Steps (all idempotent — safe to re-run):
 *   1. Drop any unique index matching the old { authUserId, titleId, assetId }
 *      key pattern (matched by key, not by name).
 *   2. Backfill `profileId: ""` onto legacy rows missing the field.
 *   3. Ensure the new unique index on { authUserId, profileId, titleId, assetId }.
 *
 * Usage:
 *   node scripts/migrate-progress-profile.mjs
 *
 * The script reads MONGODB_URI and MONGODB_DB_NAME from .env.local.
 */

import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Load env from .env.local ────────────────────────────────────────────────
const dotenv = require("dotenv")
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "user-account"

if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set in .env.local")
  process.exit(1)
}

const mongoose = require("mongoose")

const COLLECTION = "vision_watch_progress"
const OLD_KEY = { authUserId: 1, titleId: 1, assetId: 1 }
const NEW_KEY = { authUserId: 1, profileId: 1, titleId: 1, assetId: 1 }

function sameKeyPattern(a, b) {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key, i) => bKeys[i] === key && a[key] === b[key])
}

async function run() {
  console.log(`\n🔌  Connecting to MongoDB (db: ${MONGODB_DB_NAME})…`)
  await mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 30_000,
    connectTimeoutMS: 15_000,
    family: 4,
  })
  console.log("✅  Connected\n")

  const collection = mongoose.connection.db.collection(COLLECTION)

  // ── 1. Drop the old unique index (matched by key pattern) ─────────────────
  let indexes = []
  try {
    indexes = await collection.indexes()
  } catch {
    console.log(`ℹ️   Collection "${COLLECTION}" does not exist yet — nothing to drop.`)
  }

  let droppedAny = false
  for (const index of indexes) {
    if (index.unique && sameKeyPattern(index.key, OLD_KEY)) {
      console.log(`🗑   Dropping old unique index "${index.name}"…`)
      await collection.dropIndex(index.name)
      droppedAny = true
    }
  }
  if (!droppedAny) {
    console.log("ℹ️   No legacy unique index on { authUserId, titleId, assetId } found — skipping drop.")
  }

  // ── 2. Backfill profileId="" on legacy rows ────────────────────────────────
  const backfill = await collection.updateMany(
    { profileId: { $exists: false } },
    { $set: { profileId: "" } },
  )
  console.log(`✏️   Backfilled profileId="" on ${backfill.modifiedCount} legacy row(s).`)

  // ── 3. Ensure the new unique index ─────────────────────────────────────────
  console.log("🔧  Ensuring unique index on { authUserId, profileId, titleId, assetId }…")
  await collection.createIndex(NEW_KEY, { unique: true })
  console.log("   ✓ Index in place.\n")

  await mongoose.disconnect()
  console.log("🎉  Watch-progress per-profile migration complete.\n")
}

run().catch((err) => {
  console.error("❌  Migration failed:", err)
  process.exit(1)
})
