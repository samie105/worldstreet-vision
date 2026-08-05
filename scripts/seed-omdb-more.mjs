/**
 * Seed ~34 additional real films from OMDb into the Vision catalog.
 *
 * Curated mix for a Nigerian-led platform: Nollywood essentials, recent
 * blockbusters, classics, animation, prestige drama. Metadata + portrait
 * poster art come straight from OMDb (mapped with the same conventions as
 * lib/omdb/map.ts: "N/A" → empty, Runtime → seconds, Rated → g/pg/pg13/r).
 *
 * Conventions follow migrations/001-seed-catalog.mjs (env loading) and
 * migrations/004-expand-catalog.mjs (doc shape, slug formula, raw
 * collections). Differences, on purpose:
 *   • mainAssetId stays null — no stream is attached yet, and the title page
 *     already renders safely without a Play CTA when the main asset is
 *     missing (app/title/[slug]/page.tsx guards on it). Attach real assets
 *     via the admin panel to make one streamable.
 *   • weight is explicit per film (464–498) so entries interleave with the
 *     existing 500-and-down catalogue and the Top 10 rails get texture,
 *     while never out-weighing the current hero (weight 500).
 *   • Nigerian titles are tagged ["nollywood", "nigeria"] — the editorially
 *     derived "Top 10 in Nigeria" rail keys off those tags.
 *
 * Idempotent: upserts by slug (with an imdbId guard so the sparse-unique
 * imdbId index can never be violated). Re-running only refreshes.
 *
 * Usage:
 *   node scripts/seed-omdb-more.mjs --dry-run
 *   node scripts/seed-omdb-more.mjs
 *
 * Reads MONGODB_URI, MONGODB_DB_NAME and OMDB_API_KEY from .env.local.
 */

import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Load env from .env.local ────────────────────────────────────────────────
const dotenv = require("dotenv")
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const MONGODB_URI = process.env.MONGODB_URI
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "user-account"
const OMDB_API_KEY = process.env.OMDB_API_KEY
const DRY = process.argv.includes("--dry-run")

if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set in .env.local")
  process.exit(1)
}
if (!OMDB_API_KEY) {
  console.error("❌  OMDB_API_KEY is not set in .env.local")
  process.exit(1)
}

const mongoose = require("mongoose")

// ── Curated films ───────────────────────────────────────────────────────────
// [title, year, weight, { tags?, badge? }]
// Weights: 464–498, deliberately colliding with the existing 500-and-down
// spread — publishAt (newest first) breaks the ties, so these interleave.

const NOLLYWOOD = { tags: ["nollywood", "nigeria"] }

const FILMS = [
  // — Nollywood (the platform's home market) —
  ["Jagun Jagun", 2023, 497, { ...NOLLYWOOD, badge: "top10" }],
  ["The Wedding Party", 2016, 496, { ...NOLLYWOOD }],
  ["Gangs of Lagos", 2023, 493, { ...NOLLYWOOD, badge: "new-release" }],
  ["King of Boys", 2018, 491, { ...NOLLYWOOD, badge: "top10" }],
  ["Anikulapo", 2022, 489, { ...NOLLYWOOD }],
  ["The Black Book", 2023, 487, { ...NOLLYWOOD, badge: "new-release" }],
  ["A Tribe Called Judah", 2023, 485, { ...NOLLYWOOD }],
  ["Citation", 2020, 478, { ...NOLLYWOOD }],
  ["Lionheart", 2018, 474, { ...NOLLYWOOD }],
  ["93 Days", 2016, 468, { ...NOLLYWOOD }],
  // — Recent blockbusters —
  ["Top Gun: Maverick", 2022, 498, { badge: "top10" }],
  ["Spider-Man: Across the Spider-Verse", 2023, 495, { badge: "new-release" }],
  ["Avatar: The Way of Water", 2022, 494, {}],
  ["John Wick: Chapter 4", 2023, 492, {}],
  ["Barbie", 2023, 490, {}],
  ["The Batman", 2022, 488, {}],
  ["Guardians of the Galaxy Vol. 3", 2023, 486, {}],
  ["Black Panther", 2018, 484, {}],
  ["Mad Max: Fury Road", 2015, 482, {}],
  ["Gladiator", 2000, 480, {}],
  // — Classics —
  ["The Shawshank Redemption", 1994, 479, {}],
  ["Forrest Gump", 1994, 477, {}],
  ["Casablanca", 1942, 473, {}],
  ["12 Angry Men", 1957, 471, {}],
  ["City of God", 2002, 469, {}],
  // — Animation —
  ["The Lion King", 1994, 481, {}],
  ["Spirited Away", 2001, 476, {}],
  ["Coco", 2017, 475, {}],
  ["Up", 2009, 472, {}],
  // — Prestige / drama —
  ["The Social Network", 2010, 470, {}],
  // `t=1917` resolves to a posterless namesake — pin the Mendes film by id.
  ["1917", 2019, 467, { imdbId: "tt8579674" }],
  ["Get Out", 2017, 466, {}],
  ["Moonlight", 2016, 465, {}],
  ["Dead Poets Society", 1989, 464, {}],
]

// ── OMDb value conventions (mirrors lib/omdb/map.ts) ────────────────────────

const text = (v) => {
  const t = String(v ?? "").trim()
  return t === "" || t.toLowerCase() === "n/a" ? "" : t
}
const list = (v) => (text(v) ? text(v).split(",").map((x) => x.trim()).filter(Boolean) : [])
const posterUrl = (v) => (text(v).startsWith("http") ? text(v) : "")
const runtimeSeconds = (v) => {
  const t = text(v)
  const mins = Number.parseInt(t.replace(/[^\d]/g, ""), 10)
  return Number.isFinite(mins) && mins > 0 ? mins * 60 : 0
}
const yearOf = (v) => {
  const m = text(v).match(/\d{4}/)
  return m ? Number.parseInt(m[0], 10) : null
}
// Same landing spots as certificationToMaturityRating for the ratings OMDb
// actually ships on films; unknown/unrated defaults to pg13 (schema default).
const RATING = {
  G: "g", PG: "pg", "PG-13": "pg13", R: "r", "NC-17": "r",
  "TV-G": "g", "TV-PG": "pg", "TV-14": "pg13", "TV-MA": "r",
}
const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── OMDb fetch (t= exact lookup, s= search fallback) ────────────────────────

async function omdbGet(params) {
  const url = new URL("https://www.omdbapi.com/")
  url.searchParams.set("apikey", OMDB_API_KEY)
  url.searchParams.set("r", "json")
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url, { headers: { accept: "application/json" } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const payload = await res.json()
  // OMDb reports failures as HTTP 200 — the envelope is the real status.
  if (payload.Response !== "True") throw new Error(payload.Error || "Unknown OMDb error")
  return payload
}

async function fetchFilm(name, year, pinnedImdbId) {
  if (pinnedImdbId) return omdbGet({ i: pinnedImdbId, plot: "full" })
  try {
    return await omdbGet({ t: name, y: year, type: "movie", plot: "full" })
  } catch {
    // Exact-title miss (diacritics like "Aníkúlápó", subtitle variants) —
    // fall back to search and take the best year-matching movie row.
    const found = await omdbGet({ s: name, type: "movie" })
    const rows = found.Search ?? []
    const pick =
      rows.find((r) => yearOf(r.Year) === year && text(r.imdbID)) ??
      rows.find((r) => text(r.imdbID))
    if (!pick) throw new Error("no search results")
    return omdbGet({ i: pick.imdbID, plot: "full" })
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n🔌  Connecting to MongoDB (db: ${MONGODB_DB_NAME})…${DRY ? "  [dry run]" : ""}`)
  await mongoose.connect(MONGODB_URI, {
    dbName: MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 30_000,
    connectTimeoutMS: 15_000,
    family: 4,
  })
  console.log("✅  Connected\n")

  const titles = mongoose.connection.collection("vision_titles")

  let added = 0
  let updated = 0
  let failed = 0
  const seededSlugs = []

  for (const [i, [name, year, weight, opts]] of FILMS.entries()) {
    let d
    try {
      d = await fetchFilm(name, year, opts.imdbId)
    } catch (e) {
      console.log(`  FAIL  ${name.padEnd(38)} (${e.message})`)
      failed++
      await sleep(300)
      continue
    }

    const art = posterUrl(d.Poster)
    if (!art) {
      console.log(`  SKIP  ${name.padEnd(38)} — no poster art`)
      failed++
      await sleep(300)
      continue
    }

    const releaseYear = yearOf(d.Year) ?? year
    const slug = slugify(`${d.Title}-${releaseYear}`)
    const genres = list(d.Genre)
    const cast = list(d.Actors)
    const tags = opts.tags ?? []
    const doc = {
      slug,
      title: text(d.Title),
      tagline: "", // OMDb has no tagline field — never invent one.
      synopsis: text(d.Plot),
      genres,
      tags,
      cast,
      director: text(d.Director),
      releaseYear,
      durationSeconds: runtimeSeconds(d.Runtime),
      maturityRating: RATING[text(d.Rated)] || "pg13",
      status: "published",
      // Staggered so the weight-tie tiebreak (publishAt desc) is deterministic
      // and keeps this batch interleaved with the existing catalogue.
      publishAt: new Date(Date.now() - i * 3 * 3_600_000),
      posterUrl: art,
      // OMDb ships no landscape art; the UI composes fills from the poster.
      backdropUrl: art,
      kind: "movie",
      badge: opts.badge ?? null,
      logoText: text(d.Title).toUpperCase(),
      previewClipUrl: null,
      // No stream attached yet — the title page renders without a Play CTA.
      mainAssetId: null,
      trailerAssetId: null,
      collectionSlug: null,
      episodeNumber: null,
      seasonNumber: null,
      seasons: [],
      searchTerms: [text(d.Title), text(d.Plot), ...genres, ...cast, text(d.Director), ...tags]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase()),
      weight,
      imdbId: d.imdbID,
      updatedAt: new Date(),
    }

    // Upsert by slug, guarded by imdbId: if enrichment already linked this
    // imdbId under another slug, refresh that doc instead of tripping the
    // sparse-unique imdbId index with a duplicate.
    const existing = await titles.findOne({ $or: [{ imdbId: d.imdbID }, { slug }] })
    const verb = DRY ? "PLAN " : existing ? "UPD  " : "ADD  "
    console.log(`  ${verb} ${String(d.Title).slice(0, 36).padEnd(38)} ${releaseYear}  w=${weight}  ${d.imdbID}`)

    if (!DRY) {
      if (existing) {
        // Refresh metadata only — never clobber playback wiring or series
        // structure a previous migration/admin already attached.
        const { mainAssetId, trailerAssetId, previewClipUrl, seasons, kind, collectionSlug, ...metadata } = doc
        await titles.updateOne({ _id: existing._id }, { $set: metadata })
        updated++
      } else {
        await titles.insertOne({ ...doc, createdAt: new Date(), __v: 0 })
        added++
      }
    } else {
      existing ? updated++ : added++
    }
    seededSlugs.push(slug)
    // Gentle pacing — OMDb free keys are capped at 1,000 requests/day.
    await sleep(300)
  }

  const total = await titles.countDocuments()
  console.log(
    `\n${DRY ? "DRY RUN — nothing written" : "🎉  Done"}: +${added} inserted, ${updated} updated, ${failed} failed`,
  )
  console.log(`   Catalogue now holds ${total} titles`)
  console.log(`   Seeded slugs (${seededSlugs.length}): ${seededSlugs.slice(0, 8).join(", ")}${seededSlugs.length > 8 ? ", …" : ""}\n`)

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error("❌  Seed failed:", err)
  process.exit(1)
})
