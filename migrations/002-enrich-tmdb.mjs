/**
 * Migration 002 – Enrich existing Vision titles with TMDB metadata.
 *
 * ENRICHMENT ONLY: no new titles are ever created. For each existing
 * `vision_titles` document without a `tmdbId`, search TMDB by title + year,
 * score the candidates, and auto-apply ONLY high-confidence matches
 * (near-exact title AND corroborating year). Everything else is skipped with
 * a reason and left for a human in the admin UI (/admin/catalog/[id] →
 * "Find on TMDB"). A wrong poster on the wrong film is worse than no poster.
 *
 * Idempotent via `tmdbId`: re-running skips every already-enriched title, so
 * a second pass produces no duplicate writes and no field churn.
 *
 * By default only EMPTY fields are filled — hand-written copy is preserved.
 * Pass --overwrite to also replace non-empty fields (posters, synopsis, …)
 * on high-confidence matches.
 *
 * Usage:
 *   node migrations/002-enrich-tmdb.mjs --dry-run        # report only, no writes
 *   node migrations/002-enrich-tmdb.mjs                  # apply high-confidence matches
 *   node migrations/002-enrich-tmdb.mjs --overwrite      # also replace filled fields
 *   node migrations/002-enrich-tmdb.mjs --limit=5        # first 5 titles only
 *
 * Reads MONGODB_URI, MONGODB_DB_NAME and TMDB_API_KEY from .env.local.
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
const TMDB_API_KEY = process.env.TMDB_API_KEY

const DRY_RUN = process.argv.includes("--dry-run")
const OVERWRITE = process.argv.includes("--overwrite")
const LIMIT = (() => {
  const arg = process.argv.find((a) => a.startsWith("--limit="))
  const n = arg ? Number.parseInt(arg.split("=")[1], 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : Infinity
})()

if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set in .env.local")
  process.exit(1)
}
if (!TMDB_API_KEY) {
  console.error("❌  TMDB_API_KEY not configured — add it to .env.local (name is in .env.example)")
  process.exit(1)
}

// ── Mongoose (schema mirrors models/VisionTitle.ts) ─────────────────────────
const mongoose = require("mongoose")
const { Schema } = mongoose

const VisionTitleSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true },
    title: { type: String, required: true },
    tagline: { type: String, default: "" },
    synopsis: { type: String, default: "" },
    genres: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    cast: { type: [String], default: [] },
    director: { type: String, default: "" },
    releaseYear: { type: Number, default: new Date().getFullYear() },
    durationSeconds: { type: Number, default: 0 },
    maturityRating: { type: String, enum: ["g", "pg", "pg13", "r"], default: "pg13" },
    status: { type: String, enum: ["draft", "scheduled", "published", "archived"], default: "draft" },
    publishAt: { type: Date, default: null },
    posterUrl: { type: String, default: "" },
    backdropUrl: { type: String, default: "" },
    trailerAssetId: { type: String, default: null },
    mainAssetId: { type: String, default: null },
    collectionSlug: { type: String, default: null },
    episodeNumber: { type: Number, default: null },
    seasonNumber: { type: Number, default: null },
    searchTerms: { type: [String], default: [] },
    weight: { type: Number, default: 0 },
    kind: { type: String, enum: ["movie", "series"], default: "movie" },
    // No default: unenriched docs must lack the path so the sparse index skips them.
    tmdbId: { type: Number },
  },
  { timestamps: true, collection: "vision_titles" },
)
VisionTitleSchema.index({ tmdbId: 1 }, { unique: true, sparse: true })

const VisionTitle = mongoose.models.VisionTitle ?? mongoose.model("VisionTitle", VisionTitleSchema)

// ── Matching logic (KEEP IN SYNC with lib/tmdb/match.ts) ────────────────────

const HIGH_CONFIDENCE_TITLE_SCORE = 0.95
const HIGH_CONFIDENCE_YEAR_SCORE = 0.85
const MEDIUM_CONFIDENCE_SCORE = 0.72
const TITLE_WEIGHT = 0.75
const YEAR_WEIGHT = 0.25

function normalizeTitle(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function bigramCounts(value) {
  const counts = new Map()
  for (let i = 0; i < value.length - 1; i++) {
    const gram = value.slice(i, i + 2)
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }
  return counts
}

function titleSimilarity(a, b) {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return 0
  const ga = bigramCounts(na)
  const gb = bigramCounts(nb)
  let overlap = 0
  for (const [gram, count] of ga) {
    const other = gb.get(gram)
    if (other) overlap += Math.min(count, other)
  }
  return (2 * overlap) / (na.length - 1 + nb.length - 1)
}

function yearProximityScore(localYear, releaseDate) {
  const candidateYear = releaseDate ? Number.parseInt(releaseDate.slice(0, 4), 10) : NaN
  if (!localYear || Number.isNaN(candidateYear)) return 0.5
  const delta = Math.abs(localYear - candidateYear)
  if (delta === 0) return 1
  if (delta === 1) return 0.85
  if (delta === 2) return 0.6
  if (delta <= 5) return 0.3
  return 0
}

function scoreCandidate(local, candidate) {
  const titleScore = Math.max(
    titleSimilarity(local.title, candidate.title),
    candidate.originalTitle ? titleSimilarity(local.title, candidate.originalTitle) : 0,
  )
  const yearScore = yearProximityScore(local.releaseYear, candidate.releaseDate)
  const score = TITLE_WEIGHT * titleScore + YEAR_WEIGHT * yearScore
  let confidence = "low"
  if (titleScore >= HIGH_CONFIDENCE_TITLE_SCORE && yearScore >= HIGH_CONFIDENCE_YEAR_SCORE) {
    confidence = "high"
  } else if (score >= MEDIUM_CONFIDENCE_SCORE) {
    confidence = "medium"
  }
  return { candidate, score, confidence, titleScore, yearScore }
}

function rankCandidates(local, candidates) {
  return candidates
    .map((candidate) => scoreCandidate(local, candidate))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.candidate.voteCount ?? 0) - (a.candidate.voteCount ?? 0) ||
        (b.candidate.popularity ?? 0) - (a.candidate.popularity ?? 0),
    )
}

function certificationToMaturityRating(certification) {
  const cert = certification.trim().toUpperCase()
  if (cert === "G") return "g"
  if (cert === "PG") return "pg"
  if (cert === "PG-13") return "pg13"
  if (cert === "R" || cert === "NC-17") return "r"
  return null
}

function pickUsCertification(payload) {
  const us = payload.results?.find((entry) => entry.iso_3166_1 === "US")
  if (!us?.release_dates?.length) return ""
  const withCert = us.release_dates.filter((r) => (r.certification ?? "").trim() !== "")
  if (withCert.length === 0) return ""
  const theatrical = withCert.find((r) => r.type === 3)
  return (theatrical ?? withCert[0]).certification?.trim() ?? ""
}

// ── TMDB fetch (mirrors lib/tmdb/client.ts) ─────────────────────────────────

const TMDB_API_BASE = "https://api.themoviedb.org/3"
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p"

async function tmdbFetch(pathName, params = {}) {
  const url = new URL(`${TMDB_API_BASE}${pathName}`)
  for (const [name, value] of Object.entries(params)) {
    if (value !== "" && value != null) url.searchParams.set(name, String(value))
  }
  const headers = { accept: "application/json" }
  if (TMDB_API_KEY.includes(".")) {
    headers.Authorization = `Bearer ${TMDB_API_KEY}`
  } else {
    url.searchParams.set("api_key", TMDB_API_KEY)
  }
  const response = await fetch(url, { headers })
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`TMDB ${pathName} failed (${response.status}): ${body.slice(0, 200)}`)
  }
  return response.json()
}

function tmdbImageUrl(imgPath, size) {
  if (!imgPath) return ""
  return `${TMDB_IMAGE_BASE}/${size}${imgPath}`
}

const MAX_CAST_NAMES = 8

async function buildIncomingEnrichment(tmdbId) {
  const [details, credits, releaseDates] = await Promise.all([
    tmdbFetch(`/movie/${tmdbId}`),
    tmdbFetch(`/movie/${tmdbId}/credits`),
    tmdbFetch(`/movie/${tmdbId}/release_dates`),
  ])
  const director = credits.crew.find((member) => member.job === "Director")?.name ?? ""
  const cast = [...credits.cast]
    .sort((a, b) => a.order - b.order)
    .slice(0, MAX_CAST_NAMES)
    .map((member) => member.name)
  return {
    posterUrl: tmdbImageUrl(details.poster_path, "w500"),
    backdropUrl: tmdbImageUrl(details.backdrop_path, "original"),
    synopsis: details.overview ?? "",
    tagline: details.tagline ?? "",
    cast,
    director,
    genres: (details.genres ?? []).map((genre) => genre.name),
    durationSeconds: details.runtime ? details.runtime * 60 : 0,
    maturityRating: certificationToMaturityRating(pickUsCertification(releaseDates)),
    releaseYear: details.release_date
      ? Number.parseInt(details.release_date.slice(0, 4), 10) || null
      : null,
  }
}

// ── Field application policy ────────────────────────────────────────────────

const ENRICHABLE_FIELDS = [
  "posterUrl",
  "backdropUrl",
  "synopsis",
  "tagline",
  "cast",
  "director",
  "genres",
  "durationSeconds",
  "maturityRating",
  "releaseYear",
]

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === "string") return value.trim() !== ""
  if (typeof value === "number") return value !== 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function buildSearchTerms(input) {
  const parts = [
    input.title,
    input.tagline,
    input.synopsis,
    ...(input.genres ?? []),
    ...(input.tags ?? []),
    ...(input.cast ?? []),
    input.director,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return Array.from(new Set(parts.split(/[^a-z0-9]+/g).filter((s) => s.length > 2))).slice(0, 64)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// ── Run migration ────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🔌  Connecting to MongoDB (db: ${MONGODB_DB_NAME})…`)
  await mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 30_000,
    connectTimeoutMS: 15_000,
    family: 4,
  })
  console.log("✅  Connected")
  if (DRY_RUN) console.log("🧪  DRY RUN — no writes will be made")
  if (OVERWRITE) console.log("⚠️   --overwrite: high-confidence matches replace filled fields too")

  const titles = await VisionTitle.find({}).sort({ weight: -1 })
  const queue = titles.slice(0, LIMIT === Infinity ? titles.length : LIMIT)
  console.log(`\n📋  ${queue.length} title(s) to consider\n`)

  const report = {
    applied: [],
    skipped: { alreadyEnriched: [], series: [], noCandidates: [], lowConfidence: [] },
    errors: [],
    fieldCounts: Object.fromEntries(ENRICHABLE_FIELDS.map((f) => [f, 0])),
  }

  for (const title of queue) {
    const label = `${title.title} (${title.releaseYear ?? "—"})`
    try {
      if (title.tmdbId) {
        report.skipped.alreadyEnriched.push(label)
        console.log(`↷  ${label} — already enriched (tmdbId ${title.tmdbId})`)
        continue
      }
      const isSeries =
        title.kind === "series" ||
        (title.genres ?? []).some((g) => String(g).toLowerCase() === "series")
      if (isSeries) {
        report.skipped.series.push(label)
        console.log(`↷  ${label} — series (TMDB movie search only)`)
        continue
      }

      let search = await tmdbFetch("/search/movie", {
        query: title.title,
        include_adult: "false",
        year: title.releaseYear || "",
      })
      if ((search.results ?? []).length === 0 && title.releaseYear) {
        search = await tmdbFetch("/search/movie", {
          query: title.title,
          include_adult: "false",
        })
      }

      const ranked = rankCandidates(
        { title: title.title, releaseYear: title.releaseYear },
        (search.results ?? []).map((movie) => ({
          id: movie.id,
          title: movie.title,
          originalTitle: movie.original_title,
          releaseDate: movie.release_date,
          popularity: movie.popularity,
          voteCount: movie.vote_count,
        })),
      )
      const best = ranked[0]

      if (!best) {
        report.skipped.noCandidates.push(label)
        console.log(`↷  ${label} — no TMDB candidates`)
        continue
      }
      if (best.confidence !== "high") {
        const why = `${best.confidence} ${best.score.toFixed(2)} → "${best.candidate.title}" (${(best.candidate.releaseDate ?? "").slice(0, 4) || "—"})`
        report.skipped.lowConfidence.push(`${label} — ${why}`)
        console.log(`↷  ${label} — below auto-apply confidence [${why}] → confirm in admin UI`)
        continue
      }

      const incoming = await buildIncomingEnrichment(best.candidate.id)
      const update = { tmdbId: best.candidate.id }
      const appliedFields = []
      for (const field of ENRICHABLE_FIELDS) {
        if (!hasValue(incoming[field])) continue
        if (!OVERWRITE && hasValue(title[field])) continue
        update[field] = incoming[field]
        appliedFields.push(field)
        report.fieldCounts[field]++
      }
      update.searchTerms = buildSearchTerms({
        title: title.title,
        tagline: update.tagline ?? title.tagline,
        synopsis: update.synopsis ?? title.synopsis,
        genres: update.genres ?? title.genres,
        tags: title.tags,
        cast: update.cast ?? title.cast,
        director: update.director ?? title.director,
      })

      if (!DRY_RUN) {
        await VisionTitle.updateOne({ _id: title._id }, { $set: update })
      }
      report.applied.push(
        `${label} → TMDB #${best.candidate.id} "${best.candidate.title}" [${best.score.toFixed(2)}] — ${appliedFields.length ? appliedFields.join(", ") : "tmdbId only (all fields hand-filled)"}`,
      )
      console.log(
        `✓  ${label} → TMDB #${best.candidate.id} "${best.candidate.title}" [high ${best.score.toFixed(2)}]${DRY_RUN ? " (dry run)" : ""} — set: ${appliedFields.join(", ") || "tmdbId only"}`,
      )
    } catch (err) {
      report.errors.push(`${label} — ${err.message}`)
      console.error(`✗  ${label} — ${err.message}`)
    }
    await sleep(250) // stay polite to the TMDB API
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const skippedTotal =
    report.skipped.alreadyEnriched.length +
    report.skipped.series.length +
    report.skipped.noCandidates.length +
    report.skipped.lowConfidence.length

  console.log(`\n📊  Report${DRY_RUN ? " (DRY RUN — nothing was written)" : ""}`)
  console.log(`   ✓ applied            : ${report.applied.length}`)
  console.log(`   ↷ skipped            : ${skippedTotal}`)
  console.log(`     - already enriched : ${report.skipped.alreadyEnriched.length}`)
  console.log(`     - series           : ${report.skipped.series.length}`)
  console.log(`     - no candidates    : ${report.skipped.noCandidates.length}`)
  console.log(`     - below confidence : ${report.skipped.lowConfidence.length}`)
  console.log(`   ✗ errors             : ${report.errors.length}`)
  const filled = ENRICHABLE_FIELDS.filter((f) => report.fieldCounts[f] > 0)
    .map((f) => `${f}×${report.fieldCounts[f]}`)
    .join(", ")
  console.log(`   fields filled        : ${filled || "none"}`)
  if (report.skipped.lowConfidence.length > 0) {
    console.log(`\n   Needs a human (admin UI → "Find on TMDB"):`)
    for (const line of report.skipped.lowConfidence) console.log(`     • ${line}`)
  }
  if (report.errors.length > 0) {
    console.log(`\n   Errors:`)
    for (const line of report.errors) console.log(`     • ${line}`)
  }

  await mongoose.disconnect()
  console.log(`\n🎉  Migration 002 complete.${DRY_RUN ? " Re-run without --dry-run to apply." : ""}\n`)
}

run().catch((err) => {
  console.error("❌  Migration failed:", err)
  process.exit(1)
})
