import type {
  CatalogAsset,
  CatalogRail,
  CatalogTitle,
  RailWithTitles,
  SeriesEpisode,
  SeriesSeason,
  TitleBadge,
} from "./types"

const DEMO_HLS_URL =
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8"

const PREVIEW_CLIPS = [
  // Mux test pattern (short, autoplay-friendly clips)
  "https://stream.mux.com/maMTVpEJoljJBFAlTMYoOJB1Z8c2aWqAh7tzWgi9202FU.m3u8",
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8",
]

const previewFor = (idx: number) => PREVIEW_CLIPS[idx % PREVIEW_CLIPS.length]

const image = (id: string, w: number, h: number) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&h=${h}&q=85`

const portrait = (id: string) => image(id, 900, 1350)
const landscape = (id: string) => image(id, 1920, 1080)
const thumb = (id: string) => image(id, 800, 450)

interface MockSeed {
  slug: string
  title: string
  logoText?: string
  tagline: string
  synopsis: string
  genres: string[]
  tags: string[]
  cast: string[]
  director: string
  releaseYear: number
  durationSeconds: number
  maturityRating: CatalogTitle["maturityRating"]
  posterId: string
  backdropId: string
  weight: number
  kind?: "movie" | "series"
  badge?: TitleBadge | null
  /** Number of seasons + episodes per season for series. */
  seriesShape?: { seasons: number; episodesPerSeason: number }
}

const SEEDS: MockSeed[] = [
  {
    slug: "golden-hour-protocol",
    title: "Golden Hour Protocol",
    logoText: "GOLDEN HOUR\nPROTOCOL",
    tagline: "A market city hides its most valuable secret in the minutes before sunrise.",
    synopsis:
      "When a young quant discovers a timing exploit inside a global trading network, she has one golden hour to decide who deserves the truth — and who needs to be stopped before sunrise lands.",
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
    synopsis:
      "A private banker serving the ultra-rich finds a ledger that could collapse an empire built on silence, loyalty, and old money. The choice she makes in the next 48 hours will define a generation of wealth.",
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
    synopsis:
      "Five traders, one impossible position, and a night of decisions that will decide who gets rich and who disappears. Season two follows the syndicate as they take their tactics global.",
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
    synopsis:
      "At 40,000 feet, an analyst notices that every passenger in first class is tied to the same hostile takeover — and the cabin crew is already in on it.",
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
    synopsis:
      "A weekend retreat aboard a billionaire's glass yacht turns into a psychological game between rivals and heirs as the next generation fights for the family's offshore empire.",
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
    synopsis:
      "A founder is invited into a private society of dealmakers and quickly learns the price of access is obedience — and the cost of leaving is everything she has built.",
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
    synopsis:
      "An AI lab predicts market moves with terrifying accuracy, until its forecasts begin predicting crimes before they happen — and the team realizes they may be the next target.",
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
    synopsis:
      "A detective investigating a missing broker enters a world where contracts matter more than confession — and where the next deal is always closer than the last truth.",
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
    synopsis:
      "A luxury real estate agent uses her client list to expose a cartel laundering wealth through skyline towers — and discovers her own family is on the buyer side.",
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
    synopsis:
      "A documentary-style thriller follows the anonymous operators who quietly decide what liquidity looks like for the world's largest exchanges.",
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
    synopsis:
      "Inside a private members' room in London, a young analyst becomes the hinge point of a sovereign currency crisis with two governments closing in.",
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
    synopsis:
      "Three siblings inherit a blue-chip empire and turn a boardroom transition into a public war that exposes a century of compromises.",
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
    synopsis:
      "A retired trader is pulled back into the market after a familiar candle pattern appears before a political assassination she predicted years earlier.",
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
    synopsis:
      "When a volatility fund wins too much, its founder becomes the target of banks, regulators, and a former friend who now runs the regulator's enforcement arm.",
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
    synopsis:
      "A private equity analyst finds a hidden allocation that connects a clean energy deal to a decade-old tragedy and a current senator's quiet retirement plan.",
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
    synopsis:
      "A new CEO spends her first week uncovering why every predecessor left with a payout, a scandal, or a funeral — and learns the board has already chosen her successor.",
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
    synopsis:
      "A sovereign wealth negotiator uses the Monaco Grand Prix as cover for the most aggressive acquisition of the year — a deal three rivals are ready to kill for.",
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
    synopsis:
      "A darkly funny limited series about collectors, brokers, and founders living one leveraged day at a time — until the day the leverage finally calls.",
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
    synopsis:
      "A logistics billionaire and a customs investigator collide over a route carrying art, gold, and stolen identities — and a manifest that goes missing every Tuesday.",
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
    synopsis:
      "A sharp documentary series following the psychology of elite operators across sport, finance, art, and politics — and what they all secretly fear.",
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

/** Distinct stills for episode thumbnails (catalog imagery, not video). */
const EPISODE_STILL_IDS = [
  "photo-1485846234645-a62644f84728",
  "photo-1478720568477-152d9b164e26",
  "photo-1536440136628-849c177f76a1",
  "photo-1574267432553-4b641a1cb3ce",
  "photo-1440404653325-ab12749abe9b",
  "photo-1517604931442-7e0c8ed2963c",
  "photo-1509347528160-022a53aea027",
  "photo-1598899134739-24c46fdf8bcf",
  "photo-1571847140471-224d773cb8b8",
  "photo-1524985069706-3b0057ab66fa",
  "photo-1535016120810-881c2cd1b129",
  "photo-1462331947825-496fc620b3f9",
]

function episodeStillId(season: number, episode: number): string {
  const i = (season * 47 + episode * 19) % EPISODE_STILL_IDS.length
  return EPISODE_STILL_IDS[i]!
}

function buildSeasons(seed: MockSeed, titleId: string): SeriesSeason[] {
  if (!seed.seriesShape) return []
  const seasons: SeriesSeason[] = []
  for (let s = 1; s <= seed.seriesShape.seasons; s += 1) {
    const episodes: SeriesEpisode[] = []
    for (let e = 1; e <= seed.seriesShape.episodesPerSeason; e += 1) {
      const id = `${titleId}-s${s}e${e}`
      const still = episodeStillId(s, e)
      episodes.push({
        _id: id,
        seasonNumber: s,
        episodeNumber: e,
        title: `Episode ${e}: ${episodeNamePool[(s + e) % episodeNamePool.length]}`,
        synopsis: episodeSynopsisPool[(s * e) % episodeSynopsisPool.length],
        durationSeconds: 2400 + (e % 5) * 240,
        posterUrl: thumb(still),
        thumbnailUrl: thumb(still),
        assetId: id,
        cloudflareVideoUid: null,
        demoPlaybackUrl: DEMO_HLS_URL,
      })
    }
    seasons.push({
      number: s,
      label: `Season ${s}`,
      episodes,
    })
  }
  return seasons
}

const episodeNamePool = [
  "Opening Bell",
  "Dark Pool",
  "The Margin Call",
  "Quiet Period",
  "After Hours",
  "Settlement",
  "Bid/Ask",
  "Liquidation",
  "The Reset",
  "Black Swan",
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

export const MOCK_TITLES: CatalogTitle[] = SEEDS.map((seed, index) => {
  const id = `demo-title-${String(index + 1).padStart(2, "0")}`
  const isSeries = seed.kind === "series"
  const seasons = buildSeasons(seed, id)
  const totalEpisodeSeconds = seasons.reduce(
    (acc, season) => acc + season.episodes.reduce((s, ep) => s + ep.durationSeconds, 0),
    0,
  )

  return {
    _id: id,
    slug: seed.slug,
    title: seed.title,
    tagline: seed.tagline,
    synopsis: seed.synopsis,
    genres: seed.genres,
    tags: seed.tags,
    cast: seed.cast,
    director: seed.director,
    releaseYear: seed.releaseYear,
    durationSeconds: isSeries ? totalEpisodeSeconds || seed.durationSeconds : seed.durationSeconds,
    maturityRating: seed.maturityRating,
    status: "published",
    publishAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    posterUrl: portrait(seed.posterId),
    backdropUrl: landscape(seed.backdropId),
    trailerAssetId: `demo-trailer-${String(index + 1).padStart(2, "0")}`,
    mainAssetId: isSeries
      ? seasons[0]?.episodes[0]?.assetId ?? `demo-asset-${String(index + 1).padStart(2, "0")}`
      : `demo-asset-${String(index + 1).padStart(2, "0")}`,
    collectionSlug: index % 4 === 0 ? "worldstreet-originals" : null,
    episodeNumber: null,
    seasonNumber: null,
    weight: seed.weight,
    createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - index * 43_200_000).toISOString(),
    kind: isSeries ? "series" : "movie",
    previewClipUrl: previewFor(index),
    badge: seed.badge ?? null,
    logoText: seed.logoText ?? seed.title.toUpperCase(),
    seasons,
  }
})

const ASSET_LOOKUP_BY_TITLE = new Map<string, CatalogAsset[]>()

const featureAssets: CatalogAsset[] = MOCK_TITLES.flatMap((title, index) => {
  const baseAssets: CatalogAsset[] = []
  const trailerId = title.trailerAssetId ?? `demo-trailer-${index + 1}`
  baseAssets.push({
    _id: trailerId,
    externalId: trailerId,
    titleId: title._id,
    kind: "trailer",
    status: "ready",
    errorMessage: "",
    cloudflareVideoUid: null,
    signed: false,
    durationSeconds: 96,
    aspectRatio: "16:9",
    posterTimeSeconds: 5,
    captions: [],
    uploadedBy: "demo",
    demoPlaybackUrl: title.previewClipUrl ?? DEMO_HLS_URL,
    demoPosterUrl: title.backdropUrl,
    createdAt: title.createdAt,
    updatedAt: title.updatedAt,
  })

  if (title.kind === "series" && title.seasons) {
    for (const season of title.seasons) {
      for (const episode of season.episodes) {
        baseAssets.push({
          _id: episode.assetId,
          externalId: episode.assetId,
          titleId: title._id,
          kind: "feature",
          status: "ready",
          errorMessage: "",
          cloudflareVideoUid: null,
          signed: false,
          durationSeconds: episode.durationSeconds,
          aspectRatio: "16:9",
          posterTimeSeconds: 5,
          captions: [],
          uploadedBy: "demo",
          demoPlaybackUrl: episode.demoPlaybackUrl ?? DEMO_HLS_URL,
          demoPosterUrl: episode.thumbnailUrl,
          createdAt: title.createdAt,
          updatedAt: title.updatedAt,
        })
      }
    }
  } else {
    const featureId = title.mainAssetId ?? `demo-asset-${index + 1}`
    baseAssets.push({
      _id: featureId,
      externalId: featureId,
      titleId: title._id,
      kind: "feature",
      status: "ready",
      errorMessage: "",
      cloudflareVideoUid: null,
      signed: false,
      durationSeconds: title.durationSeconds,
      aspectRatio: "16:9",
      posterTimeSeconds: 5,
      captions: [],
      uploadedBy: "demo",
      demoPlaybackUrl: DEMO_HLS_URL,
      demoPosterUrl: title.backdropUrl,
      createdAt: title.createdAt,
      updatedAt: title.updatedAt,
    })
  }

  ASSET_LOOKUP_BY_TITLE.set(title._id, baseAssets)
  return baseAssets
})

export const MOCK_ASSETS: CatalogAsset[] = featureAssets

export const MOCK_RAILS: CatalogRail[] = [
  {
    _id: "demo-rail-featured",
    slug: "featured-on-worldstreet-vision",
    label: "Featured on Worldstreet Vision",
    kind: "manual",
    position: 1,
    isActive: true,
    manualSlugs: MOCK_TITLES.slice(0, 8).map((title) => title.slug),
    genreFilter: null,
  },
  {
    _id: "demo-rail-trending",
    slug: "trending-this-week",
    label: "Trending this week",
    kind: "trending",
    position: 2,
    isActive: true,
    manualSlugs: [],
    genreFilter: null,
  },
  {
    _id: "demo-rail-finance",
    slug: "high-finance-thrillers",
    label: "High-finance thrillers",
    kind: "genre",
    position: 3,
    isActive: true,
    manualSlugs: [],
    genreFilter: "Finance",
  },
  {
    _id: "demo-rail-luxury",
    slug: "luxury-and-power",
    label: "Luxury, power & consequence",
    kind: "genre",
    position: 4,
    isActive: true,
    manualSlugs: [],
    genreFilter: "Luxury",
  },
  {
    _id: "demo-rail-series",
    slug: "series-worth-binging",
    label: "Series worth binging",
    kind: "manual",
    position: 5,
    isActive: true,
    manualSlugs: MOCK_TITLES.filter((t) => t.kind === "series").map((t) => t.slug),
    genreFilter: null,
  },
  {
    _id: "demo-rail-new",
    slug: "new-on-vision",
    label: "New on Vision",
    kind: "newest",
    position: 6,
    isActive: true,
    manualSlugs: [],
    genreFilter: null,
  },
]

export function filterMockTitles(options: {
  genre?: string
  search?: string
  limit?: number
  skip?: number
  kind?: "movie" | "series"
} = {}): CatalogTitle[] {
  const q = options.search?.trim().toLowerCase()
  const genre = options.genre?.trim().toLowerCase()
  const kind = options.kind
  const filtered = MOCK_TITLES.filter((title) => {
    const kindMatch = !kind || title.kind === kind
    const genreMatch = !genre || title.genres.some((g) => g.toLowerCase() === genre)
    const searchMatch =
      !q ||
      [
        title.title,
        title.tagline,
        title.synopsis,
        title.director,
        ...title.genres,
        ...title.tags,
        ...title.cast,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    return kindMatch && genreMatch && searchMatch
  })
  return filtered.slice(options.skip ?? 0, (options.skip ?? 0) + (options.limit ?? filtered.length))
}

export function getMockTitleBySlug(slug: string): CatalogTitle | null {
  return MOCK_TITLES.find((title) => title.slug === slug.toLowerCase()) ?? null
}

export function getMockTitleById(id: string): CatalogTitle | null {
  return MOCK_TITLES.find((title) => title._id === id) ?? null
}

export function getMockAssetById(id: string): CatalogAsset | null {
  return MOCK_ASSETS.find((asset) => asset._id === id || asset.externalId === id) ?? null
}

export function getMockAssetsForTitle(titleId: string): CatalogAsset[] {
  return ASSET_LOOKUP_BY_TITLE.get(titleId) ?? []
}

export function getMockEpisodeBySlugAndIndex(
  titleSlug: string,
  seasonNumber: number,
  episodeNumber: number,
): SeriesEpisode | null {
  const title = getMockTitleBySlug(titleSlug)
  if (!title || !title.seasons) return null
  const season = title.seasons.find((s) => s.number === seasonNumber)
  if (!season) return null
  return season.episodes.find((ep) => ep.episodeNumber === episodeNumber) ?? null
}

export function getMockNextEpisode(episodeAssetId: string): {
  title: CatalogTitle
  episode: SeriesEpisode
} | null {
  for (const title of MOCK_TITLES) {
    if (title.kind !== "series" || !title.seasons) continue
    for (let s = 0; s < title.seasons.length; s += 1) {
      const season = title.seasons[s]
      const idx = season.episodes.findIndex((ep) => ep.assetId === episodeAssetId)
      if (idx === -1) continue
      const next = season.episodes[idx + 1]
      if (next) return { title, episode: next }
      const nextSeason = title.seasons[s + 1]
      if (nextSeason && nextSeason.episodes[0]) {
        return { title, episode: nextSeason.episodes[0] }
      }
      return null
    }
  }
  return null
}

export function buildMockRails(): RailWithTitles[] {
  return MOCK_RAILS.map((rail) => {
    if (rail.kind === "manual") {
      const titles = rail.manualSlugs
        .map((slug) => getMockTitleBySlug(slug))
        .filter((title): title is CatalogTitle => title !== null)
      return { rail, titles }
    }
    if (rail.kind === "genre" && rail.genreFilter) {
      return { rail, titles: filterMockTitles({ genre: rail.genreFilter, limit: 12 }) }
    }
    if (rail.kind === "newest") {
      return {
        rail,
        titles: [...MOCK_TITLES]
          .sort((a, b) => Number(new Date(b.publishAt ?? 0)) - Number(new Date(a.publishAt ?? 0)))
          .slice(0, 12),
      }
    }
    if (rail.kind === "trending") {
      return {
        rail,
        titles: [...MOCK_TITLES].sort((a, b) => b.weight - a.weight).slice(0, 12),
      }
    }
    return { rail, titles: MOCK_TITLES.slice(0, 12) }
  })
}
