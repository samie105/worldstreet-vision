/**
 * Full-route visual audit: screenshots per theme + basic hover checks.
 * Outputs: test-results/visual-audit/*.png (folder is gitignored).
 */
import * as fs from "node:fs"
import * as path from "node:path"

import { test, expect } from "@playwright/test"
import type { Page } from "@playwright/test"

import { selectDefaultViewerProfile } from "./utils"

const OUT = path.join(process.cwd(), "test-results", "visual-audit")

function shotPath(name: string) {
  return path.join(OUT, `${name}.png`)
}

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true })
})

/** next-themes toggle: aria "Switch to light mode" ⇒ currently dark. */
async function ensureTheme(page: Page, mode: "light" | "dark") {
  await page.getByTestId("top-nav").waitFor({ state: "visible", timeout: 60_000 })
  const btn = page.getByTestId("theme-toggle")
  await btn.waitFor({ state: "visible", timeout: 30_000 })
  for (let i = 0; i < 6; i++) {
    const label = ((await btn.getAttribute("aria-label")) ?? "").toLowerCase()
    const isCurrentlyDark = label.includes("light mode")
    if (mode === "dark" && isCurrentlyDark) return
    if (mode === "light" && !isCurrentlyDark) return
    await btn.click()
    await page.waitForTimeout(280)
  }
}

test.describe("Visual audit — signed-in (dev bypass)", () => {
  test.describe.configure({ timeout: 180_000 })

  test.beforeEach(async ({ context }) => {
    await selectDefaultViewerProfile(context)
  })

  async function gotoReady(page: Page, url: string) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 })
    await page.getByTestId("top-nav").waitFor({ state: "visible", timeout: 60_000 }).catch(() => {})
  }

  for (const mode of ["dark", "light"] as const) {
    test.describe(`${mode} mode`, () => {
      test(`01 home + hover + search @${mode}`, async ({ page }) => {
        await gotoReady(page, "/")
        await ensureTheme(page, mode)
        await page.waitForTimeout(400)
        await page.screenshot({ path: shotPath(`01-home-${mode}`), fullPage: true })

        const featuredRail = page.getByTestId("title-rail").nth(1)
        await featuredRail.getByTestId("title-card").first().hover()
        await page.waitForTimeout(600)
        await page.screenshot({ path: shotPath(`02-home-hover-card-${mode}`), fullPage: true })

        const searchInput = page.getByTestId("search-palette-input")
        if (await searchInput.isVisible()) {
          await searchInput.click()
          await searchInput.fill("gold")
          await page.waitForTimeout(500)
          await page.screenshot({ path: shotPath(`03-home-search-open-${mode}`), fullPage: true })
        }
      })

      test(`02 browse + hover @${mode}`, async ({ page }) => {
        await gotoReady(page, "/browse")
        await ensureTheme(page, mode)
        await page.waitForTimeout(300)
        await page.screenshot({ path: shotPath(`04-browse-${mode}`), fullPage: true })
        await page.getByTestId("title-card").first().hover()
        await page.waitForTimeout(500)
        await page.screenshot({ path: shotPath(`05-browse-hover-${mode}`), fullPage: true })
      })

      test(`03 search @${mode}`, async ({ page }) => {
        await gotoReady(page, "/search")
        await ensureTheme(page, mode)
        await page.getByTestId("search-page").getByTestId("search-input").fill("monaco")
        await expect
          .poll(async () => await page.getByTestId("title-card").count(), { timeout: 15_000 })
          .toBeGreaterThan(0)
        await page.screenshot({ path: shotPath(`06-search-${mode}`), fullPage: true })
      })

      test(`04 my-list + settings + watch-together @${mode}`, async ({ page }) => {
        await gotoReady(page, "/my-list")
        await ensureTheme(page, mode)
        await page.screenshot({ path: shotPath(`07-my-list-${mode}`), fullPage: true })

        await gotoReady(page, "/settings")
        await ensureTheme(page, mode)
        await page.screenshot({ path: shotPath(`08-settings-${mode}`), fullPage: true })

        await gotoReady(page, "/watch-together")
        await ensureTheme(page, mode)
        await page.screenshot({ path: shotPath(`09-watch-together-${mode}`), fullPage: true })
      })

      test(`05 title pages @${mode}`, async ({ page }) => {
        await gotoReady(page, "/title/golden-hour-protocol")
        await ensureTheme(page, mode)
        await page.screenshot({ path: shotPath(`10-title-movie-${mode}`), fullPage: true })

        await gotoReady(page, "/title/after-the-bell")
        await ensureTheme(page, mode)
        await page.screenshot({ path: shotPath(`11-title-series-${mode}`), fullPage: true })
      })

      test(`06 watch player @${mode}`, async ({ page }) => {
        await gotoReady(page, "/title/golden-hour-protocol")
        await ensureTheme(page, mode)
        await page.getByTestId("title-play").click()
        await expect(page).toHaveURL(/\/watch\//)
        await expect(page.getByTestId("vision-player")).toBeVisible({ timeout: 30_000 })
        await page.waitForTimeout(800)
        await page.screenshot({ path: shotPath(`12-watch-player-${mode}`), fullPage: true })
        await page.getByTestId("vision-player").hover({ position: { x: 400, y: 300 } })
        await page.waitForTimeout(400)
        await page.screenshot({ path: shotPath(`13-watch-player-hover-${mode}`), fullPage: true })
      })

      test(`07 admin @${mode}`, async ({ page }) => {
        await gotoReady(page, "/")
        await ensureTheme(page, mode)
        await gotoReady(page, "/admin")
        await page.waitForTimeout(400)
        await page.screenshot({ path: shotPath(`14-admin-${mode}`), fullPage: true })
      })

      test(`08 notifications @${mode}`, async ({ page }) => {
        await gotoReady(page, "/")
        await ensureTheme(page, mode)
        await page.getByLabel(/^Notifications/).click()
        await expect(page.getByText("Notifications", { exact: true })).toBeVisible()
        await page.waitForTimeout(300)
        await page.screenshot({ path: shotPath(`15-notifications-${mode}`), fullPage: true })
      })
    })
  }
})

test.describe("Visual audit — profile gate (no selection)", () => {
  test("profile picker dark + light (localStorage theme)", async ({ page, context }) => {
    await context.addInitScript(() => {
      try {
        window.localStorage.removeItem("vision/active-profile")
        window.localStorage.removeItem("vision/viewer-profiles")
        window.localStorage.setItem("theme", "dark")
      } catch {
        /* ignore */
      }
      document.cookie = "vision_profile=;path=/;max-age=0;SameSite=Lax"
    })
    await page.goto("/")
    await expect(page.getByText(/Who's watching\?/i)).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath("16-profile-picker-dark"), fullPage: true })

    await page.evaluate(() => {
      window.localStorage.setItem("theme", "light")
    })
    await page.reload()
    await expect(page.getByText(/Who's watching\?/i)).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: shotPath("17-profile-picker-light"), fullPage: true })
  })
})
