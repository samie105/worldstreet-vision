import mongoose, { Schema, type Document, type Model } from "mongoose"

export type VisionTitleStatus = "draft" | "scheduled" | "published" | "archived"
export type VisionMaturityRating = "g" | "pg" | "pg13" | "r"

export interface IVisionTitle extends Document {
  slug: string
  title: string
  tagline: string
  synopsis: string
  genres: string[]
  tags: string[]
  cast: string[]
  director: string
  releaseYear: number
  durationSeconds: number
  maturityRating: VisionMaturityRating
  status: VisionTitleStatus
  publishAt: Date | null
  posterUrl: string
  backdropUrl: string
  trailerAssetId: string | null
  mainAssetId: string | null
  /** Optional collection or season. */
  collectionSlug: string | null
  episodeNumber: number | null
  seasonNumber: number | null
  /** Search keywords pre-computed for fuzzy matching. */
  searchTerms: string[]
  /** Sort weight used by curated rails. Higher comes first. */
  weight: number
  /** TMDB movie id once metadata enrichment has been applied. */
  tmdbId?: number | null
  createdAt: Date
  updatedAt: Date
}

const VisionTitleSchema = new Schema<IVisionTitle>(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true },
    title: { type: String, required: true },
    tagline: { type: String, default: "" },
    synopsis: { type: String, default: "" },
    genres: { type: [String], default: [], index: true },
    tags: { type: [String], default: [] },
    cast: { type: [String], default: [] },
    director: { type: String, default: "" },
    releaseYear: { type: Number, default: new Date().getFullYear() },
    durationSeconds: { type: Number, default: 0 },
    maturityRating: {
      type: String,
      enum: ["g", "pg", "pg13", "r"],
      default: "pg13",
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "published", "archived"],
      default: "draft",
      index: true,
    },
    publishAt: { type: Date, default: null },
    posterUrl: { type: String, default: "" },
    backdropUrl: { type: String, default: "" },
    trailerAssetId: { type: String, default: null },
    mainAssetId: { type: String, default: null },
    collectionSlug: { type: String, default: null, index: true },
    episodeNumber: { type: Number, default: null },
    seasonNumber: { type: Number, default: null },
    searchTerms: { type: [String], default: [] },
    weight: { type: Number, default: 0 },
    // No default on purpose: unenriched docs must lack the path entirely so the
    // sparse unique index below skips them (a `null` default would collide).
    tmdbId: { type: Number },
  },
  { timestamps: true, collection: "vision_titles" },
)

VisionTitleSchema.index({ title: "text", synopsis: "text", searchTerms: "text" })
VisionTitleSchema.index({ status: 1, publishAt: 1 })
VisionTitleSchema.index({ tmdbId: 1 }, { unique: true, sparse: true })

const VisionTitle: Model<IVisionTitle> =
  (mongoose.models.VisionTitle as Model<IVisionTitle>) ??
  mongoose.model<IVisionTitle>("VisionTitle", VisionTitleSchema)

export default VisionTitle
