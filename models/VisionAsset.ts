import mongoose, { Schema, type Document, type Model } from "mongoose"

export type VisionAssetKind = "trailer" | "feature" | "preview" | "extra"
export type VisionAssetStatus = "uploading" | "preparing" | "ready" | "errored"

export interface IVisionAssetCaption {
  language: string
  label: string
  url: string
}

export interface IVisionAsset extends Document {
  /** Internal id used by the catalog. */
  externalId: string
  titleId: string | null
  kind: VisionAssetKind
  status: VisionAssetStatus
  errorMessage: string
  /** Cloudflare Stream video UID. Direct uploads return this before the file is uploaded. */
  cloudflareVideoUid: string | null
  /** Whether this asset uses signed/private playback. */
  signed: boolean
  durationSeconds: number
  aspectRatio: string
  posterTimeSeconds: number
  captions: IVisionAssetCaption[]
  uploadedBy: string
  createdAt: Date
  updatedAt: Date
}

const VisionAssetSchema = new Schema<IVisionAsset>(
  {
    externalId: { type: String, required: true, unique: true, index: true },
    titleId: { type: String, default: null, index: true },
    kind: {
      type: String,
      enum: ["trailer", "feature", "preview", "extra"],
      default: "feature",
    },
    status: {
      type: String,
      enum: ["uploading", "preparing", "ready", "errored"],
      default: "uploading",
      index: true,
    },
    errorMessage: { type: String, default: "" },
    cloudflareVideoUid: { type: String, default: null, index: true, sparse: true },
    signed: { type: Boolean, default: true },
    durationSeconds: { type: Number, default: 0 },
    aspectRatio: { type: String, default: "16:9" },
    posterTimeSeconds: { type: Number, default: 5 },
    captions: {
      type: [
        {
          language: { type: String, required: true },
          label: { type: String, required: true },
          url: { type: String, required: true },
        },
      ],
      default: [],
    },
    uploadedBy: { type: String, default: "" },
  },
  { timestamps: true, collection: "vision_assets" },
)

const VisionAsset: Model<IVisionAsset> =
  (mongoose.models.VisionAsset as Model<IVisionAsset>) ??
  mongoose.model<IVisionAsset>("VisionAsset", VisionAssetSchema)

export default VisionAsset
