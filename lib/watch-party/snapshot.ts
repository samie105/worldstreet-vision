export interface WatchPartySnapshot {
  inviteCode: string
  inviteUrl: string
  channel: string
  hostId: string
  titleId: string
  assetId: string
  status: "lobby" | "active" | "ended"
  participants: {
    authUserId: string
    displayName: string
    avatarUrl: string
    isHost: boolean
    joinedAt: string
  }[]
  playback: {
    isPlaying: boolean
    positionSeconds: number
    updatedAt: string
    version: number
  }
  expiresAt: string
}

export interface WatchPartyListRow {
  inviteCode: string
  assetId: string
  titleId: string
  status: WatchPartySnapshot["status"]
  participants: WatchPartySnapshot["participants"]
  updatedAt: Date
}
