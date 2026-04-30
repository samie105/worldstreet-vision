import { resolveVisionAppUrl } from "@/lib/site"

/**
 * Centralised environment access. Throws early on the server if required
 * variables are missing so we never ship a half-configured deploy.
 */
function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim() === "") {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value
}

function optional(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== "" ? value : undefined
}

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  appUrl: resolveVisionAppUrl(),
  adminEmails: (optional("ADMIN_EMAILS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  mongo: {
    get uri() {
      return required("MONGODB_URI")
    },
    dbName: optional("MONGODB_DB_NAME") ?? "user-account",
  },
  cloudflare: {
    get accountId() {
      return required("CLOUDFLARE_ACCOUNT_ID")
    },
    get apiToken() {
      return required("CLOUDFLARE_API_TOKEN")
    },
    streamWebhookSecret: optional("CLOUDFLARE_STREAM_WEBHOOK_SECRET"),
    streamSigningKeyId: optional("CLOUDFLARE_STREAM_SIGNING_KEY_ID"),
    streamSigningPrivateKey: optional("CLOUDFLARE_STREAM_SIGNING_PRIVATE_KEY"),
    streamDeliveryHost: optional("CLOUDFLARE_STREAM_DELIVERY_HOST") ?? "videodelivery.net",
  },
  ably: {
    get apiKey() {
      return required("ABLY_API_KEY")
    },
    clientName: optional("NEXT_PUBLIC_ABLY_CLIENT_NAME") ?? "worldstreet-vision",
  },
}
