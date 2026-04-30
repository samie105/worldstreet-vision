# Worldstreet Vision

Streaming storefront for Worldstreet originals and exclusives. Lives at **`https://vision.worldstreetgold.com`** in production.

Vision is its own Next.js app: catalogue, playback, watch parties, and admin tooling. It uses **Clerk** as a **satellite** of the primary `worldstreetgold.com` domain (users sign in via the central Worldstreet flow on `www`), while sessions apply across Vision routes.

Shared infrastructure where it makes sense (same Clerk application, Mongo cluster URI for convenience) does **not** mean Vision shares Academy or dashboard **code paths**—those are separate repos.

## Stack

- Next.js App Router (16) + React 19 + TypeScript
- Tailwind v4 (CSS-first), shadcn-style primitives on top of `@base-ui/react`
- Clerk authentication (satellite; production sign-in redirect → `https://www.worldstreetgold.com/login`)
- MongoDB / Mongoose (`user-account` database by default; Vision collections/models prefixed for this app)
- Cloudflare Stream — upload, encoding, signed HLS playback, captions, analytics
- Ably — watch-party realtime presence and host-authoritative playback sync
- `nuqs` for URL state, `motion` for micro-animations

## Local development

1. Install dependencies — `pnpm install` or `npm install`.
2. Copy `.env.example` to `.env.local` and fill in Vision-only values:
   - Clerk `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`
   - Mongo URI + optional `MONGODB_DB_NAME`
   - Cloudflare account id and API token
   - Cloudflare Stream signing key id and base64/PEM RS256 private key
   - Cloudflare Stream webhook secret for signed webhook delivery
   - Ably API key (server-side) for realtime token minting
   - `ADMIN_EMAILS` — comma-separated admin emails
   - For production deploys: `NEXT_PUBLIC_APP_URL=https://vision.worldstreetgold.com`
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
  ui/                     shared UI primitives
lib/
  auth/                   Clerk helpers + role resolution
  site.ts                 canonical Vision URL helpers (`vision.worldstreetgold.com`)
  catalog/                queries + serializers + types
  actions/                "use server" mutations (profile, catalog, progress, watch-party)
  video/                  Cloudflare Stream API + JWT signing + webhook verification
  realtime/               Ably realtime helpers
models/
  Vision*.ts              Mongoose schemas for catalog + progress + parties
```

## Auth flow

Unauthenticated traffic is redirected to `https://www.worldstreetgold.com/login` in production and to `/login` locally. `AuthGate` shows a short loading state while Clerk hydrates.

After sign-in/up, Clerk should return users to Vision (`NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/`, etc.—see `.env.example`), not another product’s `/dashboard`.

`getAuthUser()` (server) and `useAuth()` (client) expose a consistent user shape. Admin status comes from Clerk `publicMetadata.role === "admin"` or `ADMIN_EMAILS`.

## Catalog and uploads

Admins create titles in `/admin/catalog`. Uploads use Cloudflare Stream Direct Creator Upload; the webhook (`/api/cloudflare/stream/webhook`) updates asset status.

## Signed playback

`GET /api/playback/:assetId` validates the Clerk session and mints a short-lived Stream JWT.

## Watch progress

`saveWatchProgress` runs periodically during playback; ~92% completion marks the title finished for “Continue watching”.

## Watch Together

Hosts create parties from the watch screen; guests join via `/invite/[code]?token=...`. Realtime uses Ably tokens from `/api/watch-party/token`.

## Hardening checklist

- [x] Rate limit Cloudflare Stream webhook (in-memory) — replace with Upstash for prod
- [x] Global error boundary + custom 404 + loading skeleton
- [x] Token-based invite codes with 6-hour expiry and per-host enforcement
- [x] Cinematic theme respects `prefers-reduced-motion`
- [ ] Wire analytics provider in `lib/analytics.ts`
- [ ] Promote rate limiter to Redis-backed
- [ ] Add E2E tests for auth → browse → playback → progress
- [ ] Configure Sentry once a DSN is ready

## Deployment

- Hostname: **`vision.worldstreetgold.com`** — set `NEXT_PUBLIC_APP_URL` accordingly for metadata and invite links (`lib/site.ts` defaults production to this origin when unset).
- **Clerk satellite:** On the Vision host set `NEXT_PUBLIC_CLERK_IS_SATELLITE=true`, `NEXT_PUBLIC_CLERK_DOMAIN=vision.worldstreetgold.com`, and absolute `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `NEXT_PUBLIC_CLERK_SIGN_UP_URL` pointing at your **primary** www app (see `.env.example`). Middleware must **not** swallow Clerk’s sign-in redirect (fixed in-repo).
- On the **primary** (www / dashboard) Next app’s `ClerkProvider`, set **`allowedRedirectOrigins`** to include `https://vision.worldstreetgold.com` so Clerk may redirect back after login (see [satellite domains](https://clerk.com/docs/advanced-usage/satellite-domains)).
- In the Clerk Dashboard, add Vision under **Domains → Satellites** and confirm redirect URLs / paths don’t default users to `dashboard.*` after auth unless intended.
- Run `pnpm build` or `npm run build` for production.
- Configure the Stream webhook to hit `/api/cloudflare/stream/webhook` with matching `CLOUDFLARE_STREAM_WEBHOOK_SECRET`.
- Keep Ably keys server-side only.
