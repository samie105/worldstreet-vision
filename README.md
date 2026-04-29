# Worldstreet Vision

Cinematic streaming surface for Worldstreet. Built on the same Clerk identity,
Mongo cluster, Cloudflare foundation, and visual tokens as the dashboard, with
managed video powered by Cloudflare Stream and watch-together synchronisation
powered by Ably.

## Stack

- Next.js App Router (16) + React 19 + TypeScript
- Tailwind v4 (CSS-first), shadcn-style primitives on top of `@base-ui/react`
- Clerk authentication (satellite of `worldstreetgold.com` in production)
- MongoDB / Mongoose (shared `user-account` cluster, Vision-prefixed collections)
- Cloudflare Stream for upload, encoding, signed HLS playback, captions, analytics
- Ably for watch-party realtime presence and host-authoritative playback sync
- `nuqs` for URL state, `motion` for micro-animations

## Local development

1. Install dependencies — `pnpm install` or `npm install`.
2. Copy `.env.example` to `.env.local` and fill in:
   - Clerk `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
   - Mongo URI (re-use the dashboard cluster)
   - Cloudflare account id and API token
   - Cloudflare Stream signing key id and base64/PEM RS256 private key
   - Cloudflare Stream webhook secret for signed webhook delivery
   - Ably API key (server-side) for realtime token minting
   - `ADMIN_EMAILS` to mark Vision admins (comma-separated)
3. `npm run dev`

## Top-level layout

```
app/
  page.tsx                home rails + featured hero
  browse/                 genre filtered grid
  search/                 fuzzy search powered by Mongo text + nuqs
  title/[slug]/           title detail with cast, synopsis, MyList toggle
  watch/[assetId]/        full-bleed Cloudflare HLS player + watch-together sheet
  watch-together/         active watch parties for the current user
  invite/[code]/          guest invite landing → joins party + redirects
  my-list/                MyList grid
  settings/               playback prefs, account, sign out
  admin/                  catalog, uploads, rails, settings
  api/                    Cloudflare Stream webhook, signed playback, watch-party token
components/
  layout/                 cinematic top-nav + responsive shell
  catalog/                rails, hero, title cards, search
  player/                 watch experience with live progress save
  watch-party/            invite panel + sync logic
  admin/                  admin shell, table, editor, uploads, rails manager
  ui/                     base primitives ported from dashboard-revamp
lib/
  auth/                   Clerk helpers + role resolution
  catalog/                queries + serializers + types
  actions/                "use server" mutations (profile, catalog, progress, watch-party)
  video/                  Cloudflare Stream API + JWT signing + webhook verification
  realtime/               Ably realtime helpers
models/
  Vision*.ts              Mongoose schemas for catalog + progress + parties
```

## Auth flow

`middleware.ts` mirrors the dashboard pattern. Unauthenticated traffic is
redirected to `https://www.worldstreetgold.com/login` in production and to
`/login` in development. The `AuthGate` component shows a graceful
redirect spinner while Clerk hydrates.

`getAuthUser()` (server) and `useAuth()` (client) provide the same shape across
the app. Admin status is resolved from Clerk `publicMetadata.role === "admin"`
or by listing emails in `ADMIN_EMAILS`.

## Catalog and uploads

Admins create titles in `/admin/catalog`. Uploading a trailer or feature spawns
a Cloudflare Stream Direct Creator Upload, attaches the resulting video UID to
the title, and stores processing state in Mongo. The Cloudflare Stream webhook
(`/api/cloudflare/stream/webhook`) receives status updates and marks assets as
`preparing`, `ready`, or `errored`.

Uploads post a browser `FormData` payload directly to Cloudflare, so Vision
never proxies raw video bytes through Next.js.

## Signed playback

`GET /api/playback/:assetId` validates the Clerk session, looks up the asset,
and mints a short-lived Cloudflare Stream JWT (5-minute TTL). The token replaces
the raw video UID in the HLS URL: `https://videodelivery.net/<token>/manifest/video.m3u8`.
The watch page calls `signCloudflarePlayback()` directly so signed playback is
ready in the SSR payload.

## Watch progress

`saveWatchProgress` runs every ~15 seconds while playback is active. When the
viewer reaches 92% we mark the row complete so it stops appearing in
"Continue watching".

## Watch Together

Hosts call `createWatchParty()` from the watch screen. We persist the session
in Mongo with an invite code and signed token, and route guests through
`/invite/[code]?token=...` which auto-joins them and bounces to the watch page
with a `?party=` parameter.

The realtime channel is brokered by Ably:

- Clients fetch a TTL-bound token from `/api/watch-party/token`
- Host publishes `playback` events every 2 seconds with `{ isPlaying, position, version }`
- Guests apply the state, snapping aggressively if drift exceeds 4 seconds
- Presence state powers the "Together right now" panel

## Hardening checklist

- [x] Rate limit Cloudflare Stream webhook (in-memory) — replace with Upstash for prod
- [x] Global error boundary + custom 404 + loading skeleton
- [x] Token-based invite codes with 6-hour expiry and per-host enforcement
- [x] Cinematic theme respects `prefers-reduced-motion`
- [ ] Wire analytics provider in `lib/analytics.ts`
- [ ] Promote rate limiter to Redis-backed
- [ ] Add E2E tests for auth → browse → playback → progress
- [ ] Configure Sentry once a DSN is ready

## Deployment notes

- Vision is meant to live at `vision.worldstreetgold.com` (Clerk satellite).
- Run `pnpm build` to produce a Next.js production build.
- Configure the Cloudflare Stream webhook to call `/api/cloudflare/stream/webhook`
  and supply the same `CLOUDFLARE_STREAM_WEBHOOK_SECRET` to verify signatures.
- Ensure the Ably key is server-side only; the client only ever sees signed
  token requests.
# worldstreet-vision
