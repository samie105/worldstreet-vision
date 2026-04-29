import type { BrowserContext, Page } from "@playwright/test"

/**
 * Selects the first viewer profile so the "Who's watching?" gate doesn't
 * block subsequent tests. Done via a localStorage seed before navigation.
 */
export async function selectDefaultViewerProfile(context: BrowserContext) {
  await context.addInitScript(() => {
    if (window.localStorage.getItem("vision/active-profile")) return
    window.localStorage.setItem("vision/active-profile", "richie")
    document.cookie = "vision_profile=richie;path=/;max-age=2592000;SameSite=Lax"
  })
}

export async function dismissProfilePickerIfPresent(page: Page) {
  const trigger = page.getByTestId("viewer-profile").first()
  if (await trigger.isVisible().catch(() => false)) {
    await trigger.click()
  }
}
