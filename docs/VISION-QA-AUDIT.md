# World Street Vision — QA audit & fix plan

This document records what was exercised in an automated pass (Playwright smoke + visual audit), where screenshots live, **why parts of the UI read as “toyish” / game-launcher** instead of premium streaming, and a **prioritized backlog** for follow-up work.

**Last run:** Playwright — **28 tests passed** (11 smoke + 16 visual route captures + 1 profile gate), ~5–9 minutes on `next dev` with `DEV_AUTH_BYPASS=true`.

---

## How to reproduce

```bash
cd worldstreet-vision
npm run test:e2e              # smoke + visual audit
npm run test:e2e:visual       # screenshots only
```

**Screenshots (full-page PNGs):** `test-results/visual-audit/`  
This folder is gitignored; re-run the visual suite to regenerate assets locally.

**Naming:**

| File pattern | What it captures |
|-------------|------------------|
| `01-home-{dark,light}.png` | Home hero + rails |
| `02-home-hover-card-*` | First featured rail card hovered |
| `03-home-search-open-*` | Search palette with query |
| `04–05-browse*` | Browse grid + hover |
| `06-search-*` | `/search` with results |
| `07–09-*` | My List, Settings, Watch Together landing |
| `10–11-*` | Title detail (movie + series) |
| `12–13-*` | Watch player + hover (controls chrome) |
| `14-*` | Admin overview |
| `15-*` | Notifications popover open |
| `16–17-*` | Profile picker (no active profile), dark then light via `localStorage` |

---

## Why “Who’s watching?” / overall UI can feel toyish

These are **design choices** visible in code and screenshots, not test failures.

### Profile picker (`components/profiles/profile-picker.tsx`)

1. **Large emoji avatars** (`🎬`, `🍿`, `🧸`, …) at **text-3xl / md:text-5xl** on **flat saturated hex tiles** — reads closer to **Discord / mobile game / kids app** than Netflix (Netflix uses **neutral grays**, subtle blues, **no emoji**, simple initials or illustrations).
2. **`animate-pulse` while “Manage profiles”** — pulses feel **playful / notification-ish**, not cinematic.
3. **Rounded-2xl + heavy `shadow-2xl`** on every tile — **bouncy, “app icon”** silhouette.
4. **Hard-coded `text-white`** on headings and labels while the outer wrapper uses `bg-background` — in **light mode** the stage can feel **disconnected** from the rest of the product (streaming apps usually keep the gate **full-bleed black** or a single muted treatment).
5. **“Kids” chip** in bright emerald — fine for accessibility, but stacked with rainbow tiles it adds to **playground** energy.

### Global chrome

6. **Top nav** (`top-nav.tsx`): when not scrolled, background is **`from-black/65` gradient** even in **light mode**, while nav links use `text-foreground` — can feel **inconsistent** with a light page body (“stuck in trailer matte”).
7. **Primary / motion flourishes** (badges, springs, rank chips) are **high energy**; Netflix/Prime bias toward **restraint** (thin rules, less color noise).

**Direction for a “premium” reskin:** Netflix-style gate (dark only, neutral tiles, initials or monochrome glyphs, minimal motion), reduce emoji or replace with **SVG silhouettes**, drop pulse, soften shadows, align nav treatment with theme.

---

## Issues & inconsistencies observed (backlog)

### P0 — Correctness / polish

| ID | Item | Notes |
|----|------|--------|
| P0-1 | **Admin has no `top-nav` / theme toggle** | Theme for admin is inherited by visiting `/` first in tests. Real users toggling only inside `/admin` cannot switch theme without going back to the consumer app. **Fix:** add theme control to `AdminShell` or document “dark-only admin.” |
| P0-2 | **First-load / dev flakiness** | Long `next dev` compiles previously caused **navigation timeouts**. Mitigated with higher `navigationTimeout`, `domcontentloaded`, and splitting tests. **Watch** for `Cross origin request detected from 127.0.0.1` (Next `allowedDevOrigins` warning). |
| P0-3 | **Profile picker light mode** | Forced white typography on a light `bg-background` + `vision-stage` may **fail contrast** or look muddy — verify `16–17-profile-picker-*.png` and align tokens (`text-foreground` / dedicated dark scrim). |

### P1 — Visual / UX parity with streaming references

| ID | Item | Notes |
|----|------|--------|
| P1-1 | **Profile gate visual system** | Replace emoji-forward grid with **neutral avatars**, optional **PIN/kids** styling without game-like colors. |
| P1-2 | **Top nav in light mode** | Revisit **non-scrolled** gradient (dark black wash vs light header). |
| P1-3 | **Rails / cards on hover** | Audit **preview clip** volume UX, hover scale curves — ensure no layout jump / CLS. |
| P1-4 | **Title detail vs hero** | Ensure **light mode** detail pages and hero **share one vocabulary** (borders, spacing, typographic scale). |

### P2 — Coverage / tooling

| ID | Item | Notes |
|----|------|--------|
| P2-1 | **Invite flow** | No dedicated screenshot of `/invite/[code]` guest join + second-browser sync. |
| P2-2 | **Login / Register** | Clerk pages not in audit (bypass on). Add when testing **real auth**. |
| P2-3 | **Mobile / narrow** | Viewport fixed **1440×900**; add **project** for mobile + hamburger. |
| P2-4 | **Ably-backed Watch Together** | Host/guest sync not asserted; requires **Ably + multi-context** test or staging env. |

---

## Light vs dark — intentional behaviors already in code

- **Hero:** Gradient scrims are **dark mode only**; light mode is **photo-forward** (see `components/catalog/hero.tsx`).
- **Theme:** `next-themes` + `ThemeToggle` in consumer **top-nav** only (not admin shell).

---

## Suggested fix order (when you pick this up)

1. **Profile picker reskin** (P0-3 + P1-1) — biggest impact on “toyish” perception.  
2. **Top nav scrolled / unscrolled** behavior in light mode (P1-2).  
3. **Admin theme affordance** (P0-1).  
4. Expand Playwright (P2): invite URL, Clerk off bypass, mobile project, optional two-context Ably.

---

## Environment note

Visual and smoke tests assume **`DEV_AUTH_BYPASS=true`** in the Playwright webServer env. **Do not** rely on bypass in production; it is disabled when `NODE_ENV=production`.
