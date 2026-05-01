/**
 * Migration 001 – Seed the Vision catalog into MongoDB.
 *
 * Writes all titles, their assets (trailers + features/episodes), and the
 * homepage rails. Safe to run multiple times — every insert uses `upsert`
 * keyed on `slug` / `externalId` so re-running won't duplicate records.
 *
 * Usage:
 *   node migrations/001-seed-catalog.mjs
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

// ── Mongoose ────────────────────────────────────────────────────────────────
const mongoose = require("mongoose")
const { Schema } = mongoose

// ── Schemas (mirror the TypeScript models exactly) ──────────────────────────

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
    // Extended fields used by the frontend catalog layer
    kind: { type: String, enum: ["movie", "series"], default: "movie" },
    previewClipUrl: { type: String, default: null },
    badge: { type: String, default: null },
    logoText: { type: String, default: null },
    seasons: { type: Schema.Types.Mixed, default: [] },
  },
  { timestamps: true, collection: "vision_titles" },
)

const VisionAssetSchema = new Schema(
  {
    externalId: { type: String, required: true, unique: true, index: true },
    titleId: { type: String, default: null },
    kind: { type: String, enum: ["trailer", "feature", "preview", "extra"], default: "feature" },
    status: { type: String, enum: ["uploading", "preparing", "ready", "errored"], default: "ready" },
    errorMessage: { type: String, default: "" },
    cloudflareVideoUid: { type: String, default: null },
    signed: { type: Boolean, default: false },
    durationSeconds: { type: Number, default: 0 },
    aspectRatio: { type: String, default: "16:9" },
    posterTimeSeconds: { type: Number, default: 5 },
    captions: { type: Array, default: [] },
    uploadedBy: { type: String, default: "seed" },
    // Demo / preview playback fields (not in the TS model but used by the player)
    demoPlaybackUrl: { type: String, default: null },
    demoPosterUrl: { type: String, default: null },
  },
  { timestamps: true, collection: "vision_assets" },
)

const VisionRailSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true },
    label: { type: String, required: true },
    kind: { type: String, enum: ["manual", "trending", "newest", "continue", "genre"], default: "manual" },
    manualSlugs: { type: [String], default: [] },
    genreFilter: { type: String, default: null },
    position: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "vision_rails" },
)

const VisionTitle = mongoose.models.VisionTitle ?? mongoose.model("VisionTitle", VisionTitleSchema)
const VisionAsset = mongoose.models.VisionAsset ?? mongoose.model("VisionAsset", VisionAssetSchema)
const VisionRail = mongoose.models.VisionRail ?? mongoose.model("VisionRail", VisionRailSchema)

// ── Catalog data (adapted from mock-data.ts) ─────────────────────────────────

const DEMO_HLS_URL =
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8"

const PREVIEW_CLIPS = [
  "https://stream.mux.com/maMTVpEJoljJBFAlTMYoOJB1Z8c2aWqAh7tzWgi9202FU.m3u8",
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
]

const portrait = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&h=1350&q=85`
const landscape = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1920&h=1080&q=85`
const thumb = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&h=450&q=85`

const EPISODE_STILL_IDS = [
  "photo-1485846234645-a62644f84728", "photo-1478720568477-152d9b164e26",
  "photo-1536440136628-849c177f76a1", "photo-1574267432553-4b641a1cb3ce",
  "photo-1440404653325-ab12749abe9b", "photo-1517604931442-7e0c8ed2963c",
  "photo-1509347528160-022a53aea027", "photo-1598899134739-24c46fdf8bcf",
  "photo-1571847140471-224d773cb8b8", "photo-1524985069706-3b0057ab66fa",
  "photo-1535016120810-881c2cd1b129", "photo-1462331947825-496fc620b3f9",
]

const episodeNamePool = [
  "Opening Bell", "Dark Pool", "The Margin Call", "Quiet Period",
  "After Hours", "Settlement", "Bid/Ask", "Liquidation", "The Reset", "Black Swan",
]

const episodeSynopsisPool = [
  "An unexpected counterparty forces a recalibration before the open.",
  "A whisper from the floor sends two desks racing to the same trade.",
  "Loyalty is tested when the regulator arrives without warning.",
  "Two heirs, one signature, and a window that closes at noon.",
  "A long-dormant alarm trips and the whole network watches.",
  "What looked like a routine close becomes a reckoning by midnight.",
  "Three shorts collide and the founder makes a brutal choice.",
  "An old contract resurfaces with a new clause nobody remembers signing.",
]

const SEEDS = [
  {
    slug: "golden-hour-protocol",
    title: "Golden Hour Protocol",
    logoText: "GOLDEN HOUR\nPROTOCOL",
    tagline: "A market city hides its most valuable secret in the minutes before sunrise.",
    synopsis: "When a young quant discovers a timing exploit inside a global trading network, she has one golden hour to decide who deserves the truth — and who needs to be stopped before sunrise lands.",
    genres: ["Thriller", "Finance", "Drama"],
    tags: ["markets", "heist", "technology"],
    cast: ["Amara Stone", "Kellan Brooks", "Nia Ford"],
    director: "Luca Adebayo",
    releaseYear: 2026,
    durationSeconds: 6720,
    maturityRating: "pg13",
    posterId: "photo-1519608487953-e999c86e7455",
    backdropId: "photo-1500530855697-b586d89ba3ee",
    weight: 100,
    badge: "new-release",
  },
  {
    slug: "the-ivory-ledger",
    title: "The Ivory Ledger",
    tagline: "Every fortune has a shadow account.",
    synopsis: "A private banker serving the ultra-rich finds a ledger that could collapse an empire built on silence, loyalty, and old money. The choice she makes in the next 48 hours will define a generation of wealth.",
    genres: ["Mystery", "Drama", "Luxury"],
    tags: ["wealth", "family", "secrets"],
    cast: ["Milan Cross", "Sofia Keane", "Tariq Bell"],
    director: "Elena Moritz",
    releaseYear: 2025,
    durationSeconds: 7080,
    maturityRating: "r",
    posterId: "photo-1518005020951-eccb494ad742",
    backdropId: "photo-1507525428034-b723cf961d3e",
    weight: 96,
    badge: "exclusive",
  },
  {
    slug: "after-the-bell",
    title: "After The Bell",
    tagline: "The real trades begin when the market closes.",
    synopsis: "Five traders, one impossible position, and a night of decisions that will decide who gets rich and who disappears. Season two follows the syndicate as they take their tactics global.",
    genres: ["Finance", "Thriller", "Series"],
    tags: ["trading", "night", "pressure"],
    cast: ["Jules Carter", "Ari Vance", "Maya Cole"],
    director: "Noah Sato",
    releaseYear: 2026,
    durationSeconds: 3180,
    maturityRating: "pg13",
    posterId: "photo-1497366754035-f200968a6e72",
    backdropId: "photo-1497366811353-6870744d04b2",
    weight: 94,
    kind: "series",
    badge: "new-season",
    seriesShape: { seasons: 2, episodesPerSeason: 8 },
  },
  {
    slug: "saffron-skies",
    title: "Saffron Skies",
    tagline: "A luxury airline becomes the stage for the world's quietest coup.",
    synopsis: "At 40,000 feet, an analyst notices that every passenger in first class is tied to the same hostile takeover — and the cabin crew is already in on it.",
    genres: ["Action", "Luxury", "Thriller"],
    tags: ["aviation", "takeover", "elite"],
    cast: ["Zara Vale", "Oscar Reid", "Imani Shaw"],
    director: "Priya Nadir",
    releaseYear: 2024,
    durationSeconds: 6240,
    maturityRating: "pg13",
    posterId: "photo-1436491865332-7a61a109cc05",
    backdropId: "photo-1500534314209-a25ddb2bd429",
    weight: 92,
    badge: "recently-added",
  },
  {
    slug: "mirror-yacht",
    title: "Mirror Yacht",
    tagline: "The ocean reflects everything except the truth.",
    synopsis: "A weekend retreat aboard a billionaire's glass yacht turns into a psychological game between rivals and heirs as the next generation fights for the family's offshore empire.",
    genres: ["Mystery", "Luxury", "Drama"],
    tags: ["yacht", "inheritance", "rivalry"],
    cast: ["Theo March", "Selene Fox", "Andre Lux"],
    director: "Camille Rose",
    releaseYear: 2026,
    durationSeconds: 6900,
    maturityRating: "r",
    posterId: "photo-1500534314209-a25ddb2bd429",
    backdropId: "photo-1507525428034-b723cf961d3e",
    weight: 90,
    badge: "leaving-soon",
  },
  {
    slug: "black-card-society",
    title: "Black Card Society",
    tagline: "Membership is invitation only. Leaving is impossible.",
    synopsis: "A founder is invited into a private society of dealmakers and quickly learns the price of access is obedience — and the cost of leaving is everything she has built.",
    genres: ["Drama", "Thriller", "Luxury"],
    tags: ["society", "power", "founders"],
    cast: ["Dante Wells", "Kira Lane", "Malik Grey"],
    director: "Hugo Rennes",
    releaseYear: 2025,
    durationSeconds: 6540,
    maturityRating: "r",
    posterId: "photo-1500530855697-b586d89ba3ee",
    backdropId: "photo-1497366754035-f200968a6e72",
    weight: 88,
    badge: "top10",
  },
  {
    slug: "quantum-dividend",
    title: "Quantum Dividend",
    tagline: "Tomorrow's profits arrive today.",
    synopsis: "An AI lab predicts market moves with terrifying accuracy, until its forecasts begin predicting crimes before they happen — and the team realizes they may be the next target.",
    genres: ["Sci-Fi", "Finance", "Thriller"],
    tags: ["ai", "future", "prediction"],
    cast: ["Leah Knox", "Roman Pierce", "Yemi King"],
    director: "Tessa Moon",
    releaseYear: 2026,
    durationSeconds: 7020,
    maturityRating: "pg13",
    posterId: "photo-1518709268805-4e9042af9f23",
    backdropId: "photo-1518709268805-4e9042af9f23",
    weight: 86,
  },
  {
    slug: "capital-noir",
    title: "Capital Noir",
    tagline: "In the city of deals, everyone has a number.",
    synopsis: "A detective investigating a missing broker enters a world where contracts matter more than confession — and where the next deal is always closer than the last truth.",
    genres: ["Noir", "Crime", "Finance"],
    tags: ["detective", "broker", "crime"],
    cast: ["Elias Stone", "Mara Vale", "Cole Arden"],
    director: "Victor Sen",
    releaseYear: 2024,
    durationSeconds: 6360,
    maturityRating: "r",
    posterId: "photo-1493246507139-91e8fad9978e",
    backdropId: "photo-1519608487953-e999c86e7455",
    weight: 84,
  },
  {
    slug: "the-penthouse-index",
    title: "The Penthouse Index",
    tagline: "Rise high enough and every window becomes a weapon.",
    synopsis: "A luxury real estate agent uses her client list to expose a cartel laundering wealth through skyline towers — and discovers her own family is on the buyer side.",
    genres: ["Drama", "Crime", "Luxury"],
    tags: ["real estate", "skyline", "cartel"],
    cast: ["Anika Ross", "Gabe Holt", "Freya Quinn"],
    director: "Mina Torres",
    releaseYear: 2025,
    durationSeconds: 5880,
    maturityRating: "pg13",
    posterId: "photo-1486406146926-c627a92ad1ab",
    backdropId: "photo-1486406146926-c627a92ad1ab",
    weight: 82,
  },
  {
    slug: "market-maker",
    title: "Market Maker",
    tagline: "Control the spread. Control the world.",
    synopsis: "A documentary-style thriller follows the anonymous operators who quietly decide what liquidity looks like for the world's largest exchanges.",
    genres: ["Documentary", "Finance", "Thriller"],
    tags: ["liquidity", "markets", "documentary"],
    cast: ["Narrated by Imani Shaw"],
    director: "Rhys Dalton",
    releaseYear: 2026,
    durationSeconds: 4020,
    maturityRating: "pg",
    posterId: "photo-1460925895917-afdab827c52f",
    backdropId: "photo-1460925895917-afdab827c52f",
    weight: 80,
  },
  {
    slug: "sterling-room",
    title: "Sterling Room",
    tagline: "Where currencies are traded and loyalties are priced.",
    synopsis: "Inside a private members' room in London, a young analyst becomes the hinge point of a sovereign currency crisis with two governments closing in.",
    genres: ["Finance", "Drama", "International"],
    tags: ["currency", "london", "crisis"],
    cast: ["Sienna Holt", "Idris Moon", "Clara Finch"],
    director: "Ben Kaito",
    releaseYear: 2025,
    durationSeconds: 5940,
    maturityRating: "pg13",
    posterId: "photo-1518005020951-eccb494ad742",
    backdropId: "photo-1518005020951-eccb494ad742",
    weight: 78,
  },
  {
    slug: "blue-chip",
    title: "Blue Chip",
    tagline: "Legacy is the hardest asset to protect.",
    synopsis: "Three siblings inherit a blue-chip empire and turn a boardroom transition into a public war that exposes a century of compromises.",
    genres: ["Drama", "Family", "Luxury", "Series"],
    tags: ["legacy", "boardroom", "siblings"],
    cast: ["Nolan Reed", "Ayra Bloom", "Eden Cole"],
    director: "Mara Ives",
    releaseYear: 2024,
    durationSeconds: 6120,
    maturityRating: "pg13",
    posterId: "photo-1542744173-8e7e53415bb0",
    backdropId: "photo-1542744173-8e7e53415bb0",
    weight: 76,
    kind: "series",
    badge: "new-season",
    seriesShape: { seasons: 3, episodesPerSeason: 6 },
  },
  {
    slug: "the-last-candlestick",
    title: "The Last Candlestick",
    tagline: "One signal. One exit. No second chances.",
    synopsis: "A retired trader is pulled back into the market after a familiar candle pattern appears before a political assassination she predicted years earlier.",
    genres: ["Thriller", "Finance", "Action"],
    tags: ["charts", "signal", "assassination"],
    cast: ["Kenji Vale", "Mira Chen", "Tobias Knight"],
    director: "Samir Cole",
    releaseYear: 2026,
    durationSeconds: 6480,
    maturityRating: "r",
    posterId: "photo-1520607162513-77705c0f0d4a",
    backdropId: "photo-1520607162513-77705c0f0d4a",
    weight: 74,
  },
  {
    slug: "volatility",
    title: "Volatility",
    tagline: "Some storms are built by people.",
    synopsis: "When a volatility fund wins too much, its founder becomes the target of banks, regulators, and a former friend who now runs the regulator's enforcement arm.",
    genres: ["Finance", "Drama", "Thriller"],
    tags: ["fund", "regulators", "risk"],
    cast: ["Jade Locke", "Miles Dean", "Rafi Cole"],
    director: "Parker Wynn",
    releaseYear: 2025,
    durationSeconds: 6360,
    maturityRating: "pg13",
    posterId: "photo-1500530855697-b586d89ba3ee",
    backdropId: "photo-1469474968028-56623f02e42e",
    weight: 72,
  },
  {
    slug: "private-allocation",
    title: "Private Allocation",
    tagline: "The deal everyone wants is the one nobody should touch.",
    synopsis: "A private equity analyst finds a hidden allocation that connects a clean energy deal to a decade-old tragedy and a current senator's quiet retirement plan.",
    genres: ["Mystery", "Finance", "Drama"],
    tags: ["private equity", "energy", "investigation"],
    cast: ["Lina Faye", "Theo Black", "Ari Noor"],
    director: "Elio Shaw",
    releaseYear: 2024,
    durationSeconds: 6180,
    maturityRating: "pg13",
    posterId: "photo-1451187580459-43490279c0fa",
    backdropId: "photo-1451187580459-43490279c0fa",
    weight: 70,
  },
  {
    slug: "executive-suite",
    title: "Executive Suite",
    tagline: "The corner office has a body count.",
    synopsis: "A new CEO spends her first week uncovering why every predecessor left with a payout, a scandal, or a funeral — and learns the board has already chosen her successor.",
    genres: ["Drama", "Crime", "Series"],
    tags: ["ceo", "corporate", "scandal"],
    cast: ["Maya Cole", "Dante Wells", "Sofia Keane"],
    director: "Olivia Hart",
    releaseYear: 2026,
    durationSeconds: 3420,
    maturityRating: "r",
    posterId: "photo-1497366754035-f200968a6e72",
    backdropId: "photo-1497366811353-6870744d04b2",
    weight: 68,
    kind: "series",
    badge: "top10",
    seriesShape: { seasons: 1, episodesPerSeason: 10 },
  },
  {
    slug: "monaco-close",
    title: "Monaco Close",
    tagline: "One race weekend. One closing bell.",
    synopsis: "A sovereign wealth negotiator uses the Monaco Grand Prix as cover for the most aggressive acquisition of the year — a deal three rivals are ready to kill for.",
    genres: ["Action", "Luxury", "International"],
    tags: ["monaco", "race", "acquisition"],
    cast: ["Oscar Reid", "Amara Stone", "Noel Cross"],
    director: "Jean Malik",
    releaseYear: 2025,
    durationSeconds: 6120,
    maturityRating: "pg13",
    posterId: "photo-1500534314209-a25ddb2bd429",
    backdropId: "photo-1500534314209-a25ddb2bd429",
    weight: 66,
  },
  {
    slug: "margin-callers",
    title: "Margin Callers",
    tagline: "Debt always answers back.",
    synopsis: "A darkly funny limited series about collectors, brokers, and founders living one leveraged day at a time — until the day the leverage finally calls.",
    genres: ["Comedy", "Finance", "Series"],
    tags: ["leverage", "founders", "satire"],
    cast: ["Kellan Brooks", "Freya Quinn", "Yemi King"],
    director: "Dev Patelson",
    releaseYear: 2026,
    durationSeconds: 2880,
    maturityRating: "pg13",
    posterId: "photo-1554224155-6726b3ff858f",
    backdropId: "photo-1554224155-6726b3ff858f",
    weight: 64,
    kind: "series",
    badge: "recently-added",
    seriesShape: { seasons: 1, episodesPerSeason: 8 },
  },
  {
    slug: "the-silk-terminal",
    title: "The Silk Terminal",
    tagline: "Every shipment has two destinations.",
    synopsis: "A logistics billionaire and a customs investigator collide over a route carrying art, gold, and stolen identities — and a manifest that goes missing every Tuesday.",
    genres: ["Crime", "International", "Drama"],
    tags: ["logistics", "gold", "identity"],
    cast: ["Idris Moon", "Zara Vale", "Milan Cross"],
    director: "Arun Belle",
    releaseYear: 2024,
    durationSeconds: 6600,
    maturityRating: "r",
    posterId: "photo-1500530855697-b586d89ba3ee",
    backdropId: "photo-1493246507139-91e8fad9978e",
    weight: 62,
  },
  {
    slug: "alpha-state",
    title: "Alpha State",
    tagline: "The winners wrote the rules. Then rewrote the winners.",
    synopsis: "A sharp documentary series following the psychology of elite operators across sport, finance, art, and politics — and what they all secretly fear.",
    genres: ["Documentary", "Lifestyle", "Finance"],
    tags: ["mindset", "operators", "alpha"],
    cast: ["Narrated by Theo March"],
    director: "Ava Noor",
    releaseYear: 2026,
    durationSeconds: 3600,
    maturityRating: "pg",
    posterId: "photo-1486406146926-c627a92ad1ab",
    backdropId: "photo-1460925895917-afdab827c52f",
    weight: 60,
    kind: "series",
    seriesShape: { seasons: 2, episodesPerSeason: 6 },
  },
]

// ── Build title + asset documents from seed ───────────────────────────────────

function buildSeasons(seed, slug) {
  if (!seed.seriesShape) return []
  const seasons = []
  for (let s = 1; s <= seed.seriesShape.seasons; s++) {
    const episodes = []
    for (let e = 1; e <= seed.seriesShape.episodesPerSeason; e++) {
      const stillIdx = (s * 47 + e * 19) % EPISODE_STILL_IDS.length
      const stillId = EPISODE_STILL_IDS[stillIdx]
      const assetId = `${slug}-s${s}e${e}`
      episodes.push({
        seasonNumber: s,
        episodeNumber: e,
        title: `Episode ${e}: ${episodeNamePool[(s + e) % episodeNamePool.length]}`,
        synopsis: episodeSynopsisPool[(s * e) % episodeSynopsisPool.length],
        durationSeconds: 2400 + (e % 5) * 240,
        posterUrl: thumb(stillId),
        thumbnailUrl: thumb(stillId),
        assetId,
        cloudflareVideoUid: null,
        demoPlaybackUrl: DEMO_HLS_URL,
      })
    }
    seasons.push({ number: s, label: `Season ${s}`, episodes })
  }
  return seasons
}

const titlesData = []
const assetsData = []

SEEDS.forEach((seed, index) => {
  const isSeries = seed.kind === "series"
  const seasons = buildSeasons(seed, seed.slug)

  const totalEpisodeSeconds = seasons.reduce(
    (acc, season) => acc + season.episodes.reduce((s, ep) => s + ep.durationSeconds, 0),
    0,
  )

  const trailerExternalId = `trailer-${seed.slug}`
  const featureExternalId = isSeries
    ? (seasons[0]?.episodes[0]?.assetId ?? `feature-${seed.slug}`)
    : `feature-${seed.slug}`

  const previewClipUrl = PREVIEW_CLIPS[index % PREVIEW_CLIPS.length]

  titlesData.push({
    slug: seed.slug,
    title: seed.title,
    tagline: seed.tagline,
    synopsis: seed.synopsis,
    genres: seed.genres,
    tags: seed.tags,
    cast: seed.cast,
    director: seed.director,
    releaseYear: seed.releaseYear,
    durationSeconds: isSeries
      ? totalEpisodeSeconds || seed.durationSeconds
      : seed.durationSeconds,
    maturityRating: seed.maturityRating,
    status: "published",
    publishAt: new Date(Date.now() - index * 86_400_000),
    posterUrl: portrait(seed.posterId),
    backdropUrl: landscape(seed.backdropId),
    trailerAssetId: trailerExternalId,
    mainAssetId: featureExternalId,
    collectionSlug: index % 4 === 0 ? "worldstreet-originals" : null,
    episodeNumber: null,
    seasonNumber: null,
    searchTerms: [
      seed.title,
      seed.tagline,
      ...seed.genres,
      ...seed.tags,
      ...seed.cast,
      seed.director,
    ].map((s) => s.toLowerCase()),
    weight: seed.weight,
    kind: isSeries ? "series" : "movie",
    previewClipUrl,
    badge: seed.badge ?? null,
    logoText: seed.logoText ?? seed.title.toUpperCase(),
    seasons,
  })

  const posterUrl = landscape(seed.backdropId)

  // Trailer asset
  assetsData.push({
    externalId: trailerExternalId,
    kind: "trailer",
    status: "ready",
    cloudflareVideoUid: null,
    signed: false,
    durationSeconds: 96,
    aspectRatio: "16:9",
    posterTimeSeconds: 5,
    captions: [],
    uploadedBy: "seed",
    demoPlaybackUrl: previewClipUrl,
    demoPosterUrl: posterUrl,
    // titleId resolved after title insert
    _titleSlug: seed.slug,
  })

  if (isSeries && seasons.length > 0) {
    for (const season of seasons) {
      for (const ep of season.episodes) {
        assetsData.push({
          externalId: ep.assetId,
          kind: "feature",
          status: "ready",
          cloudflareVideoUid: null,
          signed: false,
          durationSeconds: ep.durationSeconds,
          aspectRatio: "16:9",
          posterTimeSeconds: 5,
          captions: [],
          uploadedBy: "seed",
          demoPlaybackUrl: DEMO_HLS_URL,
          demoPosterUrl: ep.thumbnailUrl,
          _titleSlug: seed.slug,
        })
      }
    }
  } else {
    assetsData.push({
      externalId: featureExternalId,
      kind: "feature",
      status: "ready",
      cloudflareVideoUid: null,
      signed: false,
      durationSeconds: seed.durationSeconds,
      aspectRatio: "16:9",
      posterTimeSeconds: 5,
      captions: [],
      uploadedBy: "seed",
      demoPlaybackUrl: DEMO_HLS_URL,
      demoPosterUrl: posterUrl,
      _titleSlug: seed.slug,
    })
  }
})

// ── Rails ─────────────────────────────────────────────────────────────────────

const railsData = [
  {
    slug: "featured-on-worldstreet-vision",
    label: "Featured on Worldstreet Vision",
    kind: "manual",
    position: 1,
    isActive: true,
    manualSlugs: SEEDS.slice(0, 8).map((s) => s.slug),
    genreFilter: null,
  },
  {
    slug: "trending-this-week",
    label: "Trending this week",
    kind: "trending",
    position: 2,
    isActive: true,
    manualSlugs: [],
    genreFilter: null,
  },
  {
    slug: "high-finance-thrillers",
    label: "High-finance thrillers",
    kind: "genre",
    position: 3,
    isActive: true,
    manualSlugs: [],
    genreFilter: "Finance",
  },
  {
    slug: "luxury-and-power",
    label: "Luxury, power & consequence",
    kind: "genre",
    position: 4,
    isActive: true,
    manualSlugs: [],
    genreFilter: "Luxury",
  },
  {
    slug: "series-worth-binging",
    label: "Series worth binging",
    kind: "manual",
    position: 5,
    isActive: true,
    manualSlugs: SEEDS.filter((s) => s.kind === "series").map((s) => s.slug),
    genreFilter: null,
  },
  {
    slug: "new-on-vision",
    label: "New on Vision",
    kind: "newest",
    position: 6,
    isActive: true,
    manualSlugs: [],
    genreFilter: null,
  },
]

// ── Run migration ─────────────────────────────────────────────────────────────

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

  // ── 1. Upsert titles ────────────────────────────────────────────────────────
  console.log(`📋  Upserting ${titlesData.length} titles…`)
  const slugToIdMap = new Map()

  for (const titleDoc of titlesData) {
    const result = await VisionTitle.findOneAndUpdate(
      { slug: titleDoc.slug },
      { $set: titleDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    slugToIdMap.set(titleDoc.slug, result._id.toString())
  }
  console.log(`   ✓ ${titlesData.length} titles done\n`)

  // ── 2. Upsert assets (resolve titleId now that we have real ObjectIds) ──────
  console.log(`🎬  Upserting ${assetsData.length} assets…`)
  let assetCount = 0

  for (const assetDoc of assetsData) {
    const titleSlug = assetDoc._titleSlug
    const titleId = slugToIdMap.get(titleSlug)
    if (!titleId) {
      console.warn(`   ⚠️  No titleId found for slug "${titleSlug}", skipping asset "${assetDoc.externalId}"`)
      continue
    }
    const { _titleSlug, ...rest } = assetDoc
    await VisionAsset.findOneAndUpdate(
      { externalId: rest.externalId },
      { $set: { ...rest, titleId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    assetCount++
  }
  console.log(`   ✓ ${assetCount} assets done\n`)

  // ── 3. Patch titles: store the real ObjectId-string titleId on each asset ──
  // The VisionTitle.trailerAssetId / mainAssetId fields store the asset's
  // externalId (string), not the Mongo _id. The queries look up assets by
  // externalId so this is already correct — no patch needed.

  // ── 4. Upsert rails ─────────────────────────────────────────────────────────
  console.log(`🛤   Upserting ${railsData.length} rails…`)
  for (const railDoc of railsData) {
    await VisionRail.findOneAndUpdate(
      { slug: railDoc.slug },
      { $set: railDoc },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  }
  console.log(`   ✓ ${railsData.length} rails done\n`)

  await mongoose.disconnect()
  console.log("🎉  Migration 001 complete — all catalog data is now in the database.\n")
  console.log("   Next steps:")
  console.log("   • Restart the Next.js dev server so catalog queries hit Mongo")
  console.log("   • The mock-data fallback will no longer be invoked for these slugs\n")
}

run().catch((err) => {
  console.error("❌  Migration failed:", err)
  process.exit(1)
})
