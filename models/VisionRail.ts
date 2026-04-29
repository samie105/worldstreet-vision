import mongoose, { Schema, type Document, type Model } from "mongoose"

export type VisionRailKind = "manual" | "trending" | "newest" | "continue" | "genre"

export interface IVisionRail extends Document {
  slug: string
  label: string
  kind: VisionRailKind
  /** When `kind === "manual"`, the explicit ordering of title slugs. */
  manualSlugs: string[]
  /** When `kind === "genre"`, restrict by genre name. */
  genreFilter: string | null
  position: number
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const VisionRailSchema = new Schema<IVisionRail>(
  {
    slug: { type: String, required: true, unique: true, index: true, lowercase: true },
    label: { type: String, required: true },
    kind: {
      type: String,
      enum: ["manual", "trending", "newest", "continue", "genre"],
      default: "manual",
    },
    manualSlugs: { type: [String], default: [] },
    genreFilter: { type: String, default: null },
    position: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: "vision_rails" },
)

const VisionRail: Model<IVisionRail> =
  (mongoose.models.VisionRail as Model<IVisionRail>) ??
  mongoose.model<IVisionRail>("VisionRail", VisionRailSchema)

export default VisionRail
