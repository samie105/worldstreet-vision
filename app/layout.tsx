import type { Metadata, Viewport } from "next"
import { Geist_Mono, Poppins, Public_Sans } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { NuqsAdapter } from "nuqs/adapters/next/app"

import "./globals.css"

import { ThemeProvider } from "@/components/theme-provider"
import { ProfileProvider } from "@/components/profile-provider"
import { AuthProvider } from "@/components/auth-provider"
import { AuthGate } from "@/components/auth-gate"
import { LayoutShell } from "@/components/layout/layout-shell"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProfilePickerGate } from "@/components/profiles/profile-picker-gate"
import { isDevAuthBypassEnabled } from "@/lib/auth/dev-bypass"
import { listTitles } from "@/lib/catalog/queries"
import { resolveVisionAppUrl } from "@/lib/site"
import { cn } from "@/lib/utils"

const publicSans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
})
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
})
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
}

export const metadata: Metadata = {
  title: {
    default: "WorldStreet Vision",
    template: "%s · WorldStreet Vision",
  },
  description:
    "Cinematic streaming for WorldStreet members. Watch premium content, build your list, and host watch parties — all in one place.",
  metadataBase: new URL(resolveVisionAppUrl()),
  icons: {
    icon: [
      { url: "/worldstreet-logo/WorldStreet1x.png", type: "image/png" },
      { url: "/worldstreet-logo/WorldStreet-logo.png", sizes: "any", type: "image/png" },
    ],
    apple: [{ url: "/worldstreet-logo/WorldStreet1x.png", type: "image/png" }],
  },
  openGraph: {
    title: "WorldStreet Vision",
    description:
      "Cinematic streaming for WorldStreet members with premium films, watch parties, and a high-class media experience.",
    siteName: "WorldStreet Vision",
    images: [{ url: "/worldstreet-logo/WorldStreet-logo.png" }],
  },
}

const isProduction = process.env.NODE_ENV === "production"

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const recommendations = await listTitles({ limit: 10 }).catch(() => [])

  const tree = (
    <html
      lang="en"
      suppressHydrationWarning
      data-ws-theme="platform"
      className={cn(
        "antialiased",
        geistMono.variable,
        "font-sans",
        publicSans.variable,
        poppins.variable,
      )}
    >
      <body>
        <ThemeProvider>
          <ProfileProvider>
            <AuthProvider>
              <NuqsAdapter>
                <AuthGate>
                  <TooltipProvider>
                    <ProfilePickerGate>
                      <LayoutShell recommendations={recommendations}>{children}</LayoutShell>
                    </ProfilePickerGate>
                  </TooltipProvider>
                </AuthGate>
              </NuqsAdapter>
            </AuthProvider>
          </ProfileProvider>
        </ThemeProvider>
      </body>
    </html>
  )

  // ClerkProvider is mounted whenever a Clerk publishable key is configured \u2014
  // even with the dev-auth bypass on for the app shell. This lets multi-user
  // features (watch parties, live chat) read the *real* signed-in identity via
  // `useUser()` so two browser tabs aren\u2019t collapsed onto the same dev user.
  const hasClerkKey = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

  if (isDevAuthBypassEnabled() && !hasClerkKey) {
    return tree
  }

  return (
    <ClerkProvider
      {...(isProduction
        ? {
            // Satellite app: primary domain is worldstreetgold.com; Vision runs on vision.*
            domain: "worldstreetgold.com",
            isSatellite: true,
            signInUrl: "https://www.worldstreetgold.com/login",
            signUpUrl: "https://www.worldstreetgold.com/register",
          }
        : {})}
    >
      {tree}
    </ClerkProvider>
  )
}
