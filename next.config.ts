import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "videodelivery.net" },
      { protocol: "https", hostname: "iframe.videodelivery.net" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "api.dicebear.com" },
      { protocol: "https", hostname: "image.tmdb.org" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
}

export default nextConfig
