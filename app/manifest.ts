import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Worldstreet Vision",
    short_name: "Vision",
    description:
      "Premium streaming, watch parties, and original Worldstreet media experiences.",
    start_url: "/",
    display: "standalone",
    background_color: "#171613",
    theme_color: "#facc15",
    icons: [
      {
        src: "/worldstreet-logo/WorldStreet1x.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/worldstreet-logo/WorldStreet-logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  }
}
