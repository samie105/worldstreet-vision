import mongoose, { Schema, type Document, type Model } from "mongoose"

export interface IVisionViewerProfile {
  id: string
  name: string
  avatarColor: string
  avatarImageUrl: string
  isKid: boolean
  preferences?: {
    autoplayPreviews?: boolean
    captionsByDefault?: boolean
  }
  createdAt?: Date
  updatedAt?: Date
}

export interface IVisionProfile extends Document {
  authUserId: string
  email: string
  displayName: string
  avatarUrl: string
  preferences: {
    autoplayPreviews: boolean
    captionsByDefault: boolean
    preferredQuality: "auto" | "1080p" | "720p" | "480p"
    maturityRating: "g" | "pg" | "pg13" | "r"
  }
  myList: string[]
  recentlyViewed: string[]
  /** Netflix-style "who's watching?" sub-profiles owned by this account. */
  viewerProfiles: IVisionViewerProfile[]
  lastSeen: Date
  createdAt: Date
  updatedAt: Date
}

const VisionProfileSchema = new Schema<IVisionProfile>(
  {
    authUserId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true },
    displayName: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    preferences: {
      autoplayPreviews: { type: Boolean, default: true },
      captionsByDefault: { type: Boolean, default: false },
      preferredQuality: {
        type: String,
        enum: ["auto", "1080p", "720p", "480p"],
        default: "auto",
      },
      maturityRating: {
        type: String,
        enum: ["g", "pg", "pg13", "r"],
        default: "r",
      },
    },
    myList: { type: [String], default: [] },
    recentlyViewed: { type: [String], default: [] },
    viewerProfiles: {
      type: [
        {
          id: { type: String, required: true },
          name: { type: String, required: true },
          avatarColor: { type: String, default: "#171717" },
          avatarImageUrl: { type: String, default: "" },
          isKid: { type: Boolean, default: false },
          preferences: {
            autoplayPreviews: { type: Boolean, default: true },
            captionsByDefault: { type: Boolean, default: false },
          },
        },
      ],
      default: [],
    },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true, collection: "vision_profiles" },
)

const VisionProfile: Model<IVisionProfile> =
  (mongoose.models.VisionProfile as Model<IVisionProfile>) ??
  mongoose.model<IVisionProfile>("VisionProfile", VisionProfileSchema)

export default VisionProfile
