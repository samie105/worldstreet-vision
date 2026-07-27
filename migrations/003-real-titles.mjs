/**
 * 003 — swap the seeded fictional catalogue for real films, IN PLACE.
 *
 * The demo catalogue was 20 invented titles ("Golden Hour Protocol", …) wearing
 * Unsplash stock photography, which is why the shelves never looked like a
 * streaming service and why OMDb enrichment was a no-op ("Movie not found!").
 *
 * This rewrites each existing document's metadata rather than deleting and
 * re-inserting, so every `_id` survives — and with it the 101 assets keyed on
 * titleId, 303 watch-progress rows, and the My List entries (which store _ids).
 * Playback keeps working because `mainAssetId` is left untouched: the poster and
 * the facts become real, the video behind them stays the seeded demo stream.
 *
 * Slugs change to match the new titles, so the two manual rails are repointed in
 * the same transaction-ish pass.
 *
 * Usage:
 *   node migrations/003-real-titles.mjs --dry-run   # print the plan, touch nothing
 *   node migrations/003-real-titles.mjs             # apply (backs up first)
 */
import { config } from "dotenv"
import mongoose from "mongoose"
import { writeFileSync, mkdirSync } from "node:fs"

config({ path: ".env.local" })

const DRY = process.argv.includes("--dry-run")
const KEY = process.env.OMDB_API_KEY
const DB = process.env.MONGODB_DB_NAME || "user-account"

if (!KEY) {
  console.error("OMDB_API_KEY missing from .env.local")
  process.exit(1)
}

/**
 * Old slug → the real title that replaces it. Finance/business/thriller cinema,
 * deliberately on-brand for WorldStreet, and series map to series so the
 * embedded season/episode structure still makes sense.
 */
const MAP = [
  { from: "golden-hour-protocol", title: "The Big Short", year: 2015 },
  { from: "the-ivory-ledger", title: "Margin Call", year: 2011 },
  { from: "after-the-bell", title: "Billions", year: 2016, series: true },
  { from: "saffron-skies", title: "The Wolf of Wall Street", year: 2013 },
  { from: "mirror-yacht", title: "Wall Street", year: 1987 },
  { from: "black-card-society", title: "The Social Network", year: 2010 },
  { from: "quantum-dividend", title: "Moneyball", year: 2011 },
  { from: "capital-noir", title: "Michael Clayton", year: 2007 },
  { from: "the-penthouse-index", title: "The Founder", year: 2016 },
  { from: "market-maker", title: "Boiler Room", year: 2000 },
  { from: "sterling-room", title: "Steve Jobs", year: 2015 },
  { from: "blue-chip", title: "Succession", year: 2018, series: true },
  { from: "the-last-candlestick", title: "Inside Job", year: 2010 },
  { from: "volatility", title: "Too Big to Fail", year: 2011 },
  { from: "private-allocation", title: "Catch Me If You Can", year: 2002 },
  { from: "executive-suite", title: "Industry", year: 2020, series: true },
  { from: "monaco-close", title: "Casino", year: 1995 },
  { from: "margin-callers", title: "Ozark", year: 2017, series: true },
  { from: "the-silk-terminal", title: "The Wizard of Lies", year: 2017 },
  { from: "alpha-state", title: "Mad Men", year: 2007, series: true },
]

const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")

const RATING = { G: "g", PG: "pg", "PG-13": "pg13", R: "r", "NC-17": "r", "TV-14": "pg13", "TV-MA": "r", "TV-PG": "pg" }

const list = (v) => (!v || v === "N/A" ? [] : String(v).split(",").map((x) => x.trim()).filter(Boolean))
const text = (v) => (!v || v === "N/A" ? "" : String(v).trim())

async function omdb(title, year, series) {
  const url = `https://www.omdbapi.com/?apikey=${KEY}&t=${encodeURIComponent(title)}&y=${year}&type=${series ? "series" : "movie"}&plot=full`
  const res = await fetch(url)
  const d = await res.json()
  if (d.Response !== "True") throw new Error(d.Error || "not found")
  return d
}

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB })
  const titles = mongoose.connection.collection("vision_titles")
  const rails = mongoose.connection.collection("vision_rails")

  if (!DRY) {
    mkdirSync("backups", { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    const path = `backups/vision-catalog-${stamp}.json`
    writeFileSync(path, JSON.stringify({
      titles: await titles.find({}).toArray(),
      rails: await rails.find({}).toArray(),
    }, null, 2))
    console.log(`backup → ${path}\n`)
  }

  const slugMoves = []
  let ok = 0, failed = 0

  for (const m of MAP) {
    let d
    try { d = await omdb(m.title, m.year, m.series) }
    catch (e) { console.log(`  FAIL  ${m.from} → "${m.title}" (${e.message})`); failed++; continue }

    // Match the original slug on a first run, or the imdbId once this migration
    // has already renamed the document — so re-running is a safe no-op update.
    const doc = await titles.findOne({ $or: [{ slug: m.from }, { imdbId: d.imdbID }] })
    if (!doc) { console.log(`  SKIP  ${m.from} — not in catalogue`); failed++; continue }

    const cast = list(d.Actors)
    const genres = list(d.Genre)
    const runtime = parseInt(String(d.Runtime).replace(/[^\d]/g, ""), 10)
    const slug = slugify(`${d.Title}-${String(d.Year).slice(0, 4)}`)

    const update = {
      title: d.Title,
      slug,
      synopsis: text(d.Plot),
      tagline: "",
      genres,
      cast,
      director: text(d.Director),
      releaseYear: parseInt(String(d.Year).slice(0, 4), 10) || doc.releaseYear,
      maturityRating: RATING[text(d.Rated)] || doc.maturityRating,
      logoText: String(d.Title).toUpperCase(),
      imdbId: d.imdbID,
      searchTerms: [d.Title, text(d.Plot), ...genres, ...cast, text(d.Director)]
        .filter(Boolean).map((s) => String(s).toLowerCase()),
      updatedAt: new Date(),
    }
    // Poster only when OMDb actually has art; never blank out what's there.
    // The landscape cards/rails render `backdropUrl`, and OMDb has no backdrop —
    // left alone, every shelf keeps showing the seeded Unsplash stock photo and
    // the catalogue still doesn't look like a streaming service. Point both at
    // the real poster: object-cover crops it to landscape on the shelves, and
    // the detail hero uses the same art at full height.
    if (text(d.Poster)) {
      update.posterUrl = d.Poster
      update.backdropUrl = d.Poster
    }
    // Series runtimes are per-episode and often absent — keep the seeded length.
    if (Number.isFinite(runtime) && runtime > 0 && !m.series) update.durationSeconds = runtime * 60

    console.log(`  ${DRY ? "PLAN " : "OK   "} ${m.from.padEnd(24)} → ${d.Title} (${d.Year}) ${d.imdbID} ${text(d.Poster) ? "poster✓" : "poster✗"}`)
    if (m.from !== slug) slugMoves.push([m.from, slug])

    if (!DRY) await titles.updateOne({ _id: doc._id }, { $set: update })
    ok++
  }

  // Manual rails address titles by slug, so they'd point at ghosts otherwise.
  const moves = new Map(slugMoves)
  for (const rail of await rails.find({ kind: "manual" }).toArray()) {
    const next = (rail.manualSlugs || []).map((s) => moves.get(s) ?? s)
    const changed = JSON.stringify(next) !== JSON.stringify(rail.manualSlugs || [])
    if (!changed) continue
    console.log(`  RAIL  ${(rail.manualSlugs || []).length} slugs repointed`)
    if (!DRY) await rails.updateOne({ _id: rail._id }, { $set: { manualSlugs: next } })
  }

  console.log(`\n${DRY ? "DRY RUN — nothing written" : "applied"}: ${ok} updated, ${failed} failed`)
  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
