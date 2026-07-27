/**
 * 004 — widen the catalogue so the shelves stop repeating.
 *
 * After 003 the catalogue held 20 real films. Spread across six rails that
 * meant the same posters appeared over and over, which reads as a demo rather
 * than a service. This adds ~45 more real titles across genres — thrillers,
 * sci-fi, crime, drama, classics — so every rail can show a different face.
 *
 * Each new title is wired to an existing READY feature asset (rotating through
 * the pool of 81) so Play works everywhere; the video behind them is the same
 * seeded demo stream the original catalogue used. Metadata and art are real.
 *
 * Also repairs the watch-progress table: 11+ rows point at `demo-title-NN`
 * ids that match no document, which is why "Continue watching" silently fell
 * back to `lib/catalog/mock-data.ts` and kept showing Unsplash stock photos.
 * Those rows are dropped and a handful of real ones seeded in their place.
 *
 * Idempotent: titles are upserted on imdbId, so re-running only refreshes.
 *
 *   node migrations/004-expand-catalog.mjs --dry-run
 *   node migrations/004-expand-catalog.mjs
 */
import { config } from "dotenv"
import mongoose from "mongoose"
import { writeFileSync, mkdirSync } from "node:fs"

config({ path: ".env.local", quiet: true })

const DRY = process.argv.includes("--dry-run")
const KEY = process.env.OMDB_API_KEY
const DB = process.env.MONGODB_DB_NAME || "user-account"
if (!KEY) { console.error("OMDB_API_KEY missing"); process.exit(1) }

/** Deliberately broad: the owner's note was "there are different movies out there". */
const FILMS = [
  ["Inception", 2010], ["The Dark Knight", 2008], ["Heat", 1995],
  ["Se7en", 1995], ["Zodiac", 2007], ["Prisoners", 2013],
  ["No Country for Old Men", 2007], ["There Will Be Blood", 2007],
  ["The Departed", 2006], ["Goodfellas", 1990], ["The Godfather", 1972],
  ["Pulp Fiction", 1994], ["Fight Club", 1999], ["The Matrix", 1999],
  ["Blade Runner 2049", 2017], ["Arrival", 2016], ["Interstellar", 2014],
  ["Dune", 2021], ["Sicario", 2015], ["Gone Girl", 2014],
  ["Nightcrawler", 2014], ["Whiplash", 2014], ["Parasite", 2019],
  ["Oppenheimer", 2023], ["Everything Everywhere All at Once", 2022],
  ["Knives Out", 2019], ["The Prestige", 2006], ["Shutter Island", 2010],
  ["American Psycho", 2000], ["Wolf Hall", 2015, true],
  ["Spotlight", 2015], ["The Insider", 1999], ["Erin Brockovich", 2000],
  ["Molly's Game", 2017], ["The Accountant", 2016], ["Rogue Trader", 1999],
  ["Enron: The Smartest Guys in the Room", 2005], ["Glengarry Glen Ross", 1992],
  ["Trading Places", 1983], ["The Firm", 1993], ["Arbitrage", 2012],
  ["Breaking Bad", 2008, true], ["The Wire", 2002, true],
  ["Better Call Saul", 2015, true], ["White Collar", 2009, true],
  ["Suits", 2011, true], ["House of Cards", 2013, true],
  ["Black Mirror", 2011, true], ["Severance", 2022, true],
  ["The Bear", 2022, true],
]

/** Rotated across new titles so shelves aren't a wall of identical chips. */
const BADGES = [null, "new-release", "top10", "recently-added", null, "exclusive", null, "leaving-soon"]

const slugify = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
const RATING = { G: "g", PG: "pg", "PG-13": "pg13", R: "r", "NC-17": "r", "TV-14": "pg13", "TV-MA": "r", "TV-PG": "pg", "TV-G": "g" }
const list = (v) => (!v || v === "N/A" ? [] : String(v).split(",").map((x) => x.trim()).filter(Boolean))
const text = (v) => (!v || v === "N/A" ? "" : String(v).trim())

async function omdb(title, year, series) {
  const res = await fetch(`https://www.omdbapi.com/?apikey=${KEY}&t=${encodeURIComponent(title)}&y=${year}&type=${series ? "series" : "movie"}&plot=full`)
  const d = await res.json()
  if (d.Response !== "True") throw new Error(d.Error || "not found")
  return d
}

const main = async () => {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: DB })
  const titles = mongoose.connection.collection("vision_titles")
  const assets = mongoose.connection.collection("vision_assets")
  const progress = mongoose.connection.collection("vision_watch_progress")

  const pool = (await assets.find({ kind: "feature", status: "ready" }, { projection: { externalId: 1 } }).toArray()).map((a) => a.externalId)
  console.log(`asset pool: ${pool.length} ready features\n`)

  if (!DRY) {
    mkdirSync("backups", { recursive: true })
    const p = `backups/vision-expand-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
    writeFileSync(p, JSON.stringify({ titles: await titles.find({}).toArray(), progress: await progress.find({}).toArray() }, null, 2))
    console.log(`backup → ${p}\n`)
  }

  const startWeight = 500
  let added = 0, refreshed = 0, failed = 0, i = 0

  for (const [name, year, series] of FILMS) {
    let d
    try { d = await omdb(name, year, series) }
    catch (e) { console.log(`  FAIL  ${name} (${e.message})`); failed++; continue }
    if (!text(d.Poster)) { console.log(`  SKIP  ${name} — no poster art`); failed++; continue }

    const existing = await titles.findOne({ imdbId: d.imdbID })
    const cast = list(d.Actors)
    const genres = list(d.Genre)
    const runtime = parseInt(String(d.Runtime).replace(/[^\d]/g, ""), 10)
    const doc = {
      slug: slugify(`${d.Title}-${String(d.Year).slice(0, 4)}`),
      title: d.Title,
      tagline: "",
      synopsis: text(d.Plot),
      genres,
      tags: [],
      cast,
      director: text(d.Director),
      releaseYear: parseInt(String(d.Year).slice(0, 4), 10) || year,
      durationSeconds: Number.isFinite(runtime) && runtime > 0 ? runtime * 60 : 5400,
      maturityRating: RATING[text(d.Rated)] || "pg13",
      status: "published",
      publishAt: new Date(),
      posterUrl: d.Poster,
      // Cards/rails read backdropUrl and OMDb has no landscape art — the UI
      // composes a blurred fill from this, so the poster is the right source.
      backdropUrl: d.Poster,
      kind: series ? "series" : "movie",
      badge: BADGES[i % BADGES.length],
      logoText: String(d.Title).toUpperCase(),
      previewClipUrl: null,
      // Rotate the demo streams so every new title is actually playable.
      mainAssetId: pool.length ? pool[i % pool.length] : null,
      trailerAssetId: null,
      collectionSlug: null,
      episodeNumber: null,
      seasonNumber: null,
      seasons: [],
      searchTerms: [d.Title, text(d.Plot), ...genres, ...cast, text(d.Director)].filter(Boolean).map((s) => String(s).toLowerCase()),
      weight: startWeight - i,
      imdbId: d.imdbID,
      updatedAt: new Date(),
    }

    console.log(`  ${DRY ? "PLAN " : existing ? "REFR " : "ADD  "} ${String(d.Title).slice(0, 34).padEnd(35)} ${d.Year} ${d.imdbID}`)
    if (!DRY) {
      if (existing) { await titles.updateOne({ _id: existing._id }, { $set: doc }); refreshed++ }
      else { await titles.insertOne({ ...doc, createdAt: new Date(), __v: 0 }); added++ }
    } else { existing ? refreshed++ : added++ }
    i++
  }

  // ── Continue watching was showing mock stock photos because these rows point
  //    at ids that were never real. Drop them, then seed a few genuine ones.
  const valid = await titles.find({}, { projection: { _id: 1, mainAssetId: 1 } }).limit(6).toArray()
  const bogus = await progress.countDocuments({ titleId: { $not: /^[0-9a-f]{24}$/i } })
  console.log(`\n  progress rows pointing at non-existent titles: ${bogus}`)
  if (!DRY && bogus) {
    await progress.deleteMany({ titleId: { $not: /^[0-9a-f]{24}$/i } })
    const prof = await mongoose.connection.collection("vision_profiles").findOne({})
    if (prof) {
      const pid = prof.viewerProfiles?.[0]?.id ?? ""
      for (const [n, t] of valid.slice(0, 4).entries()) {
        await progress.updateOne(
          { authUserId: prof.authUserId, profileId: pid, titleId: String(t._id), assetId: t.mainAssetId ?? "" },
          { $set: { positionSeconds: 300 + n * 420, durationSeconds: 6000, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true },
        )
      }
      console.log(`  seeded 4 real continue-watching rows for ${prof.authUserId}`)
    }
  }

  const total = await titles.countDocuments()
  console.log(`\n${DRY ? "DRY RUN — nothing written" : "applied"}: +${added} new, ${refreshed} refreshed, ${failed} failed · catalogue now ${DRY ? "would be ~" : ""}${total}`)
  await mongoose.disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
