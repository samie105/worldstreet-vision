<!-- markdownlint-disable-file -->

# Task Research Notes: Watch Party UX Fixes + Autoplay + DB Sync + Series Quality

## Research Executed

### File Analysis

- `components/player/vision-player.tsx`
  - HLS.js loaded via dynamic `import()` inside a `useEffect` — no explicit `video.play()` call after attach; native `autoPlay` attribute fires before HLS has a stream ready → silently fails on most browsers
  - `onWaiting` handler sets `playing: true` (wrong) instead of toggling a `buffering` state → no spinner shown
  - `bufferedEnd` state is tracked and `bufferedPercent` computed → passed to `ScrubBar` but zero buffering UX in the overlay (no spinner, no loading text)
  - `ScrubBar` presumably renders the buffer track visually — the critical gap is the centered circular spinner

- `components/watch-party/watch-party-panel.tsx`
  - No `"comment"` message type exists — zero live chat capability
  - Panel layout: invite link → members → role info → end button. No chat section.
  - `isHost` computed correctly from `session.hostId === user.userId`
  - Transport mode lock works: disabled play/pause/seek for guests ✓
  - "Everyone is host" scenario: any user visiting `/watch/ID?party=new` sees "Start a watch party." If guest doesn't have the invite link they click Start and become host of a **new** disconnected session. There is no "join with code" input.
  - Host broadcasts every 8s (interval) + on play/pause/seek. Drift HARD_DRIFT=4s / DRIFT_TOLERANCE=1.25s. Both branches do identical seeks (dead code duplication).

- `components/player/watch-experience.tsx`
  - `transportMode` logic: correct for confirmed host/guest, defaults to "follow-host" when hydrating ✓
  - Guest role locked correctly once `activePartySession` resolves

- `lib/profiles/store.tsx`
  - Viewer sub-profiles (Netflix "who's watching?") are 100% localStorage — `STORAGE_KEY = "vision/viewer-profiles"`, `ACTIVE_KEY = "vision/active-profile"`
  - DEFAULT_PROFILES hard-coded: "Richie", "Ava", "Kids"
  - Mutations (`addProfile`, `updateProfile`, `removeProfile`) only write to localStorage

- `models/VisionProfile.ts`
  - Has `displayName`, `avatarUrl`, `preferences` (quality, captions, maturity), `myList`, `recentlyViewed` — all synced to MongoDB ✓
  - **Missing**: `viewerProfiles` sub-document array for the multi-profile feature

- `lib/actions/profile.ts`
  - `fetchProfile`, `updateProfile`, `toggleMyList` → all functional MongoDB server actions ✓

- `app/title/[slug]/page.tsx`
  - Loads `progressSeconds` for `title.mainAssetId` only — not per-episode for series
  - `SeriesEpisodes` receives no progress data at all

- `components/catalog/series-episodes.tsx`
  - Renders thumbnail, title, synopsis, duration per episode
  - No progress bar overlay, no "Continue" badge, no season watched count

- `models/VisionWatchParty.ts`
  - Schema has `playback.positionSeconds` and `playback.version` — time sync infrastructure exists ✓
  - No `comments` or `chat` field — live chat is ephemeral (Ably channel history)

### Code Search Results

- `onWaiting` handler in vision-player
  - Sets `playing: true` → no buffering state transition, no spinner shown

- `hls.loadSource` / `hls.attachMedia`
  - No `Hls.Events.MANIFEST_PARSED` handler → `autoPlay` attr fires before stream is attached → silent fail

- `ViewerProfilesProvider` storage
  - All 4 mutations + initial load hit `window.localStorage` only

- `getWatchPartyForParticipant` call path
  - When token is undefined and user is not in participants → returns `{ success: false, error: "You're not part of this watch party" }`
  - Panel shows `hydrateError` UI → no "Start" button shown (this part is correct)
  - The real "everyone is host" scenario: user clicks "Watch Together" from title page → `/watch/ID?party=new` → panel's `initialMode = "new"` → shows "Start" button → user starts their own party, disconnected from original host

## Key Discoveries

### Issue 1: Autoplay + Buffering

```
Root cause A (no autoplay):
  HLS.js import is async. By the time hls.loadSource/attachMedia runs, 
  the video element's autoPlay attribute has already fired with no src — silently fails.
  Safari native HLS works (video.src = src, autoPlay fires after src sets) ✓

Root cause B (no buffer UX):
  onWaiting → setPlaying(true) is wrong. Should be setBuffering(true).
  No spinner element exists in the overlay.
```

```tsx
// Fix: after hls.attachMedia
hls.on(Hls.Events.MANIFEST_PARSED, () => {
  if (autoPlay) void video.play().catch(() => {})
})
// Also add buffering state:
const [buffering, setBuffering] = React.useState(false)
// <video onWaiting={() => setBuffering(true)} onPlaying={() => setBuffering(false)} />
// Spinner: absolute centered, z-[3], animated SVG circle
```

### Issue 2: Viewer Profiles DB Sync

```
Current: localStorage only — profiles lost on new device/browser, 
         no shared across sessions, no per-user isolation.

Fix: Extend VisionProfile schema with viewerProfiles subdocument array.
     Add 3 server actions: getViewerProfiles, upsertViewerProfile, deleteViewerProfile.
     Migrate ViewerProfilesProvider to hydrate from DB on mount, 
     write to DB on mutations (optimistic update → DB confirm → rollback on error).
```

```ts
// VisionProfile schema addition:
viewerProfiles: [{
  id: String,
  name: String,
  avatarColor: String,
  avatarImageUrl: String,
  isKid: Boolean,
  preferences: { autoplayPreviews: Boolean, captionsByDefault: Boolean }
}]
```

### Issue 3: Watch Party — Roles, Sync, Live Comments

**The host/guest flow gap:**
```
?party=new  → always "Start new party" → user becomes host of a new disconnected session
?party=CODE → hydrates existing session → user joins as guest if already in participants

Gap: no "join existing session without invite link" UI
Gap: no live chat system at all
```

**Time sync improvement:**
```
Current: broadcast every 8s interval + on play/pause/seek events
         HARD_DRIFT and DRIFT_TOLERANCE both do identical video.currentTime = x (dead code)
         No latency compensation (serverAt timestamp is captured but never used)

Fix:
- Tighten interval to 3s
- Use serverAt for latency compensation: adjustedPosition = data.positionSeconds + (Date.now() - data.serverAt) / 1000
- Remove duplicate drift branches
- Use requestAnimationFrame for guest sync to minimize visual jitter
```

**Live comments architecture:**
```
Ably channel: vision:watch-party:{inviteCode} (same channel, new message name)
Message type: "comment"
Payload: { id, text, authorId, authorName, authorAvatar, timestamp }

Ephemeral: Ably channel history (last 100 messages, 2min TTL default)
On subscribe: channel.history({ limit: 100 }) → load recent chat
On send: channel.publish("comment", payload) → optimistic local add
Panel layout change: split into tabs (People | Chat) or integrated chat below members list
```

**Join-by-code fix:**
```
When initialMode === "new" or null, show secondary "Join a party" input:
  - 6-char code input + "Join" button
  - Calls getWatchPartyForParticipant(code) 
  - If user not in participants → "Ask host for the invite link to join"
  - If user is in participants (already joined via invite) → session hydrates
```

### Issue 4: Series Episode Quality

```
Missing data: SeriesEpisodes receives no progress data
Fix: In TitlePage, load all VisionWatchProgress records for the user 
     for this title (not just mainAssetId) → pass progressMap to SeriesEpisodes

Missing UX:
- Per-episode progress bar overlay (% fill at bottom of thumbnail)
- "Continue" pill badge on episodes with 5%–95% progress
- "Watched" checkmark on episodes with >95% progress  
- Season "X / Y" counter
- Episode number more visually prominent
```

## Recommended Approach

### Implementation Order (all at once, as requested)

**1. `vision-player.tsx` — Autoplay + Buffer spinner:**
- Add `MANIFEST_PARSED` handler in HLS.js setup → `video.play()` explicitly after HLS ready
- Add `buffering` state → `onWaiting → setBuffering(true)`, `onPlaying/onCanPlay → setBuffering(false)`
- Render a centered spinner (`animate-spin` SVG circle) inside the player when `buffering && !showControls`
- Buffer track in `ScrubBar`: confirm it renders visually (if not, add a lighter progress fill layer)

**2. `models/VisionProfile.ts` + `lib/actions/profile.ts` — Viewer profiles DB:**
- Add `viewerProfiles` array to VisionProfile schema
- Add `getViewerProfiles`, `upsertViewerProfile`, `deleteViewerProfile` server actions
- Migrate `lib/profiles/store.tsx` → remove localStorage as source-of-truth, use DB with optimistic local state

**3. Watch party — roles + sync + chat:**
- `watch-party-panel.tsx`: Add "Join with code" input in pre-session view, fix host-only "Start" label
- `watch-party-panel.tsx`: Tighten broadcast to 3s, fix latency-compensated guest sync, remove dead drift code
- `watch-party-panel.tsx`: Add chat section — ephemeral Ably message type "comment", scrollable list, input
- New comment message handling in the realtime effect (subscribe "comment" event, add to local state)

**4. `app/title/[slug]/page.tsx` + `components/catalog/series-episodes.tsx` — Series quality:**
- In TitlePage: load `VisionWatchProgress.find({ authUserId, titleId })` → build `progressMap: Record<assetId, number>`
- Pass `progressMap` as prop to `SeriesEpisodes`
- In episode cards: show progress bar overlay, "Continue" / "Watched" badge, season stats

## Implementation Guidance

- **Objectives**: Production-quality playback start, DB-synced profiles, exclusive host/guest roles with live chat, premium series browsing
- **Key Tasks**:
  1. `vision-player.tsx` — 3 changes (MANIFEST_PARSED, buffering state, spinner JSX)
  2. `models/VisionProfile.ts` — add viewerProfiles field
  3. `lib/actions/profile.ts` — 3 new server actions
  4. `lib/profiles/store.tsx` — migrate to DB-backed mutations
  5. `watch-party-panel.tsx` — join-by-code input, sync tightening, live chat (largest change)
  6. `app/title/[slug]/page.tsx` — load episode progress map
  7. `components/catalog/series-episodes.tsx` — progress UI
- **Dependencies**: Ably channel history API (`channel.history`), HLS.js `Events.MANIFEST_PARSED`, VisionWatchProgress model (already exists)
- **Success Criteria**:
  - Video plays immediately when navigating from title page
  - Buffering spinner appears during network stalls
  - Viewer profiles persist across devices (DB-backed)
  - Guests get `follow-host` transport from the first frame; hosts get full controls
  - Live comments appear in real-time for all party members
  - Series episodes show individual watch progress bars and resume points
