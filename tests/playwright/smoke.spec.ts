import { test, expect } from "@playwright/test"

import { selectDefaultViewerProfile } from "./utils"

test.beforeEach(async ({ context }) => {
  await selectDefaultViewerProfile(context)
})

test("home page renders hero, top nav, and at least one rail of landscape cards", async ({
  page,
}) => {
  await page.goto("/")

  await expect(page.getByTestId("top-nav")).toBeVisible()
  await expect(page.getByTestId("hero")).toBeVisible()
  await expect(page.getByTestId("hero-play")).toBeVisible()

  // Pick a rail that we know has plenty of items (skip the "Continue watching"
  // rail which only has a few entries).
  const featuredRail = page.getByTestId("title-rail").nth(1)
  await expect(featuredRail).toBeVisible()
  const cards = featuredRail.getByTestId("title-card")
  expect(await cards.count()).toBeGreaterThan(3)

  const firstCardBox = await cards.first().boundingBox()
  if (firstCardBox) {
    // Cards should be landscape — wider than they are tall
    expect(firstCardBox.width).toBeGreaterThan(firstCardBox.height)
  }
})

test("browse page lists titles in a grid", async ({ page }) => {
  await page.goto("/browse")
  await expect(page.getByTestId("browse-page")).toBeVisible()
  const cards = page.getByTestId("title-card")
  expect(await cards.count()).toBeGreaterThan(5)
})

test("title detail page shows hero, play, watch-together, and series episodes", async ({
  page,
}) => {
  // After-the-bell is seeded as a series with episodes in mock data
  await page.goto("/title/after-the-bell")
  await expect(page.getByTestId("title-name")).toContainText("After The Bell")
  await expect(page.getByTestId("title-play")).toBeVisible()
  await expect(page.getByTestId("title-watch-together")).toBeVisible()
  await expect(page.getByTestId("series-episodes")).toBeVisible()
  await expect(page.getByTestId("episode-row").first()).toBeVisible()
})

test("series detail page can navigate into the watch route", async ({ page }) => {
  await page.goto("/title/after-the-bell")
  await page.getByTestId("episode-row").first().click()
  await expect(page).toHaveURL(/\/watch\//)
  await expect(page.getByTestId("vision-player")).toBeVisible()
})

test("search palette returns live results on keydown", async ({ page }) => {
  await page.goto("/")
  const searchInput = page.getByTestId("search-palette-input")
  await searchInput.fill("yacht")

  const searchResults = page.getByTestId("search-results")
  await expect(searchResults).toBeVisible()
  await expect(searchResults).toContainText(/Mirror Yacht/i)
})

test("dedicated search page filters results live as you type", async ({ page }) => {
  await page.goto("/search")
  await page.getByTestId("search-page").getByTestId("search-input").fill("monaco")
  const cards = page.getByTestId("title-card")
  await expect.poll(async () => await cards.count(), { timeout: 8_000 }).toBeGreaterThan(0)
  await expect(cards.first()).toContainText(/Monaco/i)
})

test("notification bell shows movie thumbnails", async ({ page }) => {
  await page.goto("/")
  await page.getByLabel(/^Notifications/).click()
  await expect(page.getByText("Notifications", { exact: true })).toBeVisible()
  await expect(page.getByText(/Because you watched/i)).toBeVisible()
})

test("watch route renders the custom Vision player", async ({ page }) => {
  await page.goto("/title/golden-hour-protocol")
  await page.getByTestId("title-play").click()
  await expect(page).toHaveURL(/\/watch\//)
  await expect(page.getByTestId("vision-player")).toBeVisible()
  await expect(page.getByTestId("player-scrubber")).toBeVisible()
  await expect(page.getByTestId("player-time")).toBeVisible()
})

test("watch together panel opens from inside the player", async ({ page }) => {
  await page.goto("/title/golden-hour-protocol")
  await page.getByTestId("title-watch-together").click()
  await expect(page).toHaveURL(/party=new/)
  await expect(page.getByTestId("vision-player")).toBeVisible()
  await expect(page.getByText("Watch Together", { exact: true })).toBeVisible()
})

test("watch together creates an invite when starting a new party", async ({ page }) => {
  await page.goto("/title/golden-hour-protocol")
  await page.getByTestId("title-watch-together").click()
  await expect(page).toHaveURL(/party=new/)
  // The "new" mode auto-creates a party — invite link should populate.
  await expect(page.getByText("Invite link", { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Code\s+[A-Z0-9]{8}/)).toBeVisible()
})

test("profile picker (who's watching) renders when no profile is active", async ({
  page,
  context,
}) => {
  await context.addInitScript(() => {
    window.localStorage.removeItem("vision/active-profile")
    document.cookie = "vision_profile=;path=/;max-age=0;SameSite=Lax"
  })
  await page.goto("/")
  await expect(page.getByText(/Who's watching\?/i)).toBeVisible()
  const tile = page.getByTestId("viewer-profile").first()
  await tile.click()
  await expect(page.getByTestId("hero")).toBeVisible()
})
