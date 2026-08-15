/**
 * Seed the catalogue with films Vision can legally stream today.
 *
 * Two buckets, both free of licence fees:
 *   · PUBLIC DOMAIN — US copyright expired or never renewed (pre-1929 works,
 *     plus 1940s–50s titles whose registrations lapsed). Hosted by the
 *     Internet Archive, which serves the actual MP4.
 *   · CREATIVE COMMONS — the Blender Foundation open movies and Sita Sings the
 *     Blues, released CC-BY / CC-0 by their creators.
 *
 * Every title here PLAYS. That is the point: the OMDb seed gave us real
 * metadata attached to a placeholder stream, which is fine for a layout test
 * and useless for a demo. These are whole films.
 *
 * Metadata and poster art come from OMDb (which publishes both legitimately);
 * only the video URL comes from the Archive.
 *
 *   node scripts/seed-public-domain.mjs [--dry-run]
 */

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import mongoose from "mongoose"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DRY = process.argv.includes("--dry-run")
const OMDB_KEY = process.env.OMDB_API_KEY
const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME || "user-account"
if (!uri) throw new Error("MONGODB_URI missing")

const ARCHIVE = (id, file) => `https://archive.org/download/${id}/${encodeURIComponent(file)}`

/** Curated: each entry is verified to serve a playable MP4. */
const FILMS = [
  // ── Public domain ────────────────────────────────────────────────────────
  { omdb: "Nosferatu",            year: 1922, id: "nosferatu_1922",            file: "nosferatu_1922.mp4",                 licence: "public-domain" },
  { omdb: "His Girl Friday",      year: 1940, id: "his_girl_friday",           file: "his_girl_friday_512kb.mp4",          licence: "public-domain" },
  { omdb: "The General",          year: 1926, id: "TheGeneral1926",            file: "The_General_1926_720p_512kb.mp4",    licence: "public-domain" },
  { omdb: "Detour",               year: 1945, id: "detour_1945",               file: "detour_4k.ia.mp4",                   licence: "public-domain" },
  { omdb: "Carnival of Souls",    year: 1962, id: "carnival_of_souls",         file: "carnival_of_souls_512kb.mp4",        licence: "public-domain" },
  { omdb: "House on Haunted Hill",year: 1959, id: "house_on_haunted_hill_ipod",file: "house_on_haunted_hill.mp4",          licence: "public-domain" },
  { omdb: "The Phantom of the Opera", year: 1925, id: "ThePhantomoftheOpera",  file: "ThePhantomoftheOpera.mp4",           licence: "public-domain" },
  { omdb: "The Lost World",       year: 1925, id: "lost_world",                file: "lost_world_512kb.mp4",               licence: "public-domain" },
  { omdb: "Meet John Doe",        year: 1941, id: "meet_john_doe",             file: "meet_john_doe_512kb.mp4",            licence: "public-domain" },
  { omdb: "Scarlet Street",       year: 1945, id: "ScarletStreet",             file: "ScarletStreet.mp4",                  licence: "public-domain" },
  { omdb: "Suddenly",             year: 1954, id: "suddenly",                  file: "suddenly_512kb.mp4",                 licence: "public-domain" },
  { omdb: "The Stranger",         year: 1946, id: "TheStranger_0",             file: "TheStranger.mp4",                    licence: "public-domain" },
  { omdb: "My Favorite Brunette", year: 1947, id: "my_favorite_brunette",      file: "my_favorite_brunette_512kb.mp4",     licence: "public-domain" },
  { omdb: "Gulliver's Travels",   year: 1939, id: "gullivers_travels1939",     file: "gullivers_travels1939_512kb.mp4",    licence: "public-domain" },
  { omdb: "Royal Wedding",        year: 1951, id: "royal_wedding",             file: "royal_wedding_512kb.mp4",            licence: "public-domain" },
  { omdb: "Impact",               year: 1949, id: "impact",                    file: "impact_512kb.mp4",                   licence: "public-domain" },
  { omdb: "The Flying Deuces",    year: 1939, id: "TheFlyingDeuces",           file: "TheFlyingDeuces.mp4",                licence: "public-domain" },
  { omdb: "20,000 Leagues Under the Sea", year: 1916, id: "20000LeaguesUndertheSea", file: "20000LeaguesUndertheSea.mp4", licence: "public-domain" },
  // ── Creative Commons ─────────────────────────────────────────────────────
  { omdb: "Big Buck Bunny",       year: 2008, id: "BigBuckBunny_124",          file: "Content/big_buck_bunny_720p_surround.mp4", licence: "creative-commons" },
  { omdb: "Sintel",               year: 2010, id: "Sintel",                    file: "sintel-2048-stereo.mp4",             licence: "creative-commons" },
  { omdb: "Elephants Dream",      year: 2006, id: "ElephantsDream",            file: "ed_1024.mp4",                        licence: "creative-commons" },
  { omdb: "Sita Sings the Blues", year: 2008, id: "Sita_Sings_the_Blues",      file: "Sita_Sings_the_Blues_small.mp4",     licence: "creative-commons" },
]

const slugify = (t, y) =>
  `${t}-${y}`.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const RATING = { G: "g", PG: "pg", "PG-13": "pg13", R: "r", "NOT RATED": "pg", UNRATED: "pg", APPROVED: "pg", PASSED: "pg", "TV-G": "g", "TV-PG": "pg" }

async function omdb(title, year) {
  if (!OMDB_KEY) return null
  const u = `https://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(title)}&y=${year}&plot=full`
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(20_000) })
    const d = await r.json()
    return d?.Response === "True" ? d : null
  } catch { return null }
}

await mongoose.connect(uri, { dbName })
const db = mongoose.connection.db
const Titles = db.collection("vision_titles")
const Assets = db.collection("vision_assets")
const Rails = db.collection("vision_rails")

let inserted = 0, updated = 0, missed = 0
const slugs = []

for (const [i, f] of FILMS.entries()) {
  const meta = await omdb(f.omdb, f.year)
  if (!meta) { missed += 1; console.log(`  ! no OMDb match: ${f.omdb} (${f.year})`); }

  const title = meta?.Title || f.omdb
  const year = Number(meta?.Year?.slice(0, 4)) || f.year
  const slug = slugify(title, year)
  slugs.push(slug)
  const runtimeMin = Number(String(meta?.Runtime || "").replace(/\D/g, "")) || 90
  const na = (v) => (!v || v === "N/A" ? "" : v)
  const now = new Date()
  const playback = ARCHIVE(f.id, f.file)

  if (DRY) { console.log(`  would seed ${slug} → ${playback}`); continue }

  const doc = {
    slug,
    title,
    tagline: na(meta?.Awards),
    synopsis: na(meta?.Plot) || `${title} (${year}) — free to watch on Vision.`,
    genres: na(meta?.Genre) ? meta.Genre.split(",").map((s) => s.trim()) : ["Classic"],
    // The tag is what the "Free to watch" rail and any future licence audit key off.
    tags: ["free-to-stream", f.licence],
    cast: na(meta?.Actors) ? meta.Actors.split(",").map((s) => s.trim()) : [],
    director: na(meta?.Director),
    releaseYear: year,
    durationSeconds: runtimeMin * 60,
    maturityRating: RATING[String(meta?.Rated || "").toUpperCase()] || "pg",
    status: "published",
    publishAt: new Date(now.getTime() - i * 3_600_000),
    posterUrl: na(meta?.Poster),
    backdropUrl: na(meta?.Poster),
    kind: "movie",
    collectionSlug: null,
    episodeNumber: null,
    seasonNumber: null,
    searchTerms: [title.toLowerCase(), String(year), f.licence],
    // Below the licensed-poster titles so those still lead the shelves, but
    // high enough that these show up where a viewer will find them.
    weight: 430 - i,
    updatedAt: now,
  }

  const res = await Titles.updateOne(
    { slug },
    { $set: doc, $setOnInsert: { createdAt: now } },
    { upsert: true },
  )
  res.upsertedCount ? (inserted += 1) : (updated += 1)

  const titleDoc = await Titles.findOne({ slug }, { projection: { _id: 1 } })
  const externalId = `feature-${slug}`
  await Assets.updateOne(
    { externalId },
    {
      $set: {
        titleId: String(titleDoc._id),
        kind: "feature",
        status: "ready",
        cloudflareVideoUid: null,
        signed: false,
        durationSeconds: runtimeMin * 60,
        aspectRatio: "16:9",
        posterTimeSeconds: 5,
        captions: [],
        uploadedBy: "public-domain-seed",
        demoPlaybackUrl: playback,
        demoPosterUrl: na(meta?.Poster),
        updatedAt: now,
      },
      $setOnInsert: { externalId, createdAt: now },
    },
    { upsert: true },
  )
  const asset = await Assets.findOne({ externalId }, { projection: { _id: 1 } })
  await Titles.updateOne({ slug }, { $set: { mainAssetId: String(asset._id), updatedAt: now } })

  console.log(`  ✓ ${slug}`)
  await new Promise((r) => setTimeout(r, 250)) // OMDb pacing
}

if (!DRY) {
  // A rail that tells the truth: these are the ones that actually play.
  await Rails.updateOne(
    { slug: "free-to-watch" },
    {
      $set: {
        slug: "free-to-watch",
        label: "Free to watch — full films",
        kind: "manual",
        manualSlugs: slugs,
        genreFilter: null,
        position: 1,
        isActive: true,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true },
  )
}

console.log(JSON.stringify({ inserted, updated, omdbMisses: missed, railTitles: slugs.length }, null, 1))
await mongoose.disconnect()
