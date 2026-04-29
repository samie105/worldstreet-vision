import mongoose, { Schema, type Document, type Model } from "mongoose"

export type VisionWatchPartyStatus = "lobby" | "active" | "ended"

export interface IVisionWatchPartyParticipant {
  authUserId: string
  displayName: string
  avatarUrl: string
  joinedAt: Date
  isHost: boolean
}

export interface IVisionWatchParty extends Document {
  /** Short, sharable identifier used in the invite link. */
  inviteCode: string
  /** Signed token used by guests when accepting an invite. */
  inviteToken: string
  hostId: string
  titleId: string
  assetId: string
  status: VisionWatchPartyStatus
  participants: IVisionWatchPartyParticipant[]
  /** Mirrors the latest playback state so late joiners can seek to it. */
  playback: {
    isPlaying: boolean
    positionSeconds: number
    updatedAt: Date
    version: number
  }
  /** Realtime channel name used by the Ably room. */
  channel: string
  expiresAt: Date
  createdAt: Date
  updatedAt: Date
}

const VisionWatchPartySchema = new Schema<IVisionWatchParty>(
  {
    inviteCode: { type: String, required: true, unique: true, index: true },
    inviteToken: { type: String, required: true },
    hostId: { type: String, required: true, index: true },
    titleId: { type: String, required: true },
    assetId: { type: String, required: true },
    status: {
      type: String,
      enum: ["lobby", "active", "ended"],
      default: "lobby",
      index: true,
    },
    participants: {
      type: [
        {
          authUserId: { type: String, required: true },
          displayName: { type: String, required: true },
          avatarUrl: { type: String, default: "" },
          joinedAt: { type: Date, default: Date.now },
          isHost: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    playback: {
      isPlaying: { type: Boolean, default: false },
      positionSeconds: { type: Number, default: 0 },
      updatedAt: { type: Date, default: Date.now },
      version: { type: Number, default: 0 },
    },
    channel: { type: String, required: true },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 6),
      index: true,
    },
  },
  { timestamps: true, collection: "vision_watch_parties" },
)

const VisionWatchParty: Model<IVisionWatchParty> =
  (mongoose.models.VisionWatchParty as Model<IVisionWatchParty>) ??
  mongoose.model<IVisionWatchParty>("VisionWatchParty", VisionWatchPartySchema)

export default VisionWatchParty
