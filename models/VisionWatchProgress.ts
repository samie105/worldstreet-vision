import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface IVisionWatchProgress extends Document {
  authUserId: string
  titleId: string
  assetId: string
  positionSeconds: number
  durationSeconds: number
  completed: boolean
  lastWatchedAt: Date
  createdAt: Date
  updatedAt: Date
}

const VisionWatchProgressSchema = new Schema<IVisionWatchProgress>(
  {
    authUserId: { type: String, required: true, index: true },
    titleId: { type: String, required: true, index: true },
    assetId: { type: String, required: true, index: true },
    positionSeconds: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    lastWatchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "vision_watch_progress" },
)

VisionWatchProgressSchema.index(
  { authUserId: 1, titleId: 1, assetId: 1 },
  { unique: true },
)

const VisionWatchProgress: Model<IVisionWatchProgress> =
  (mongoose.models.VisionWatchProgress as Model<IVisionWatchProgress>) ??
  mongoose.model<IVisionWatchProgress>("VisionWatchProgress", VisionWatchProgressSchema)

export default VisionWatchProgress
