import "server-only"

import Ably from "ably"

import { env } from "@/lib/env"

let cachedClient: Ably.Rest | null = null

export function getAblyRest(): Ably.Rest {
  if (cachedClient) return cachedClient
  cachedClient = new Ably.Rest(env.ably.apiKey)
  return cachedClient
}

export function watchPartyChannelName(inviteCode: string): string {
  return `vision:watch-party:${inviteCode}`
}
