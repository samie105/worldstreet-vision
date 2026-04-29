import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function avatarUrl(avatar: string | null | undefined, seed: string | null | undefined): string {
  if (avatar && avatar.trim() !== "") return avatar
  const safeSeed = encodeURIComponent((seed ?? "user").trim() || "user")
  return `https://api.dicebear.com/9.x/avataaars/svg?seed=${safeSeed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "0:00"
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96)
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

export function relativeTime(input: Date | string | number): string {
  const date = typeof input === "object" ? input : new Date(input)
  const diff = (date.getTime() - Date.now()) / 1000
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  if (abs < 60) return rtf.format(Math.round(diff), "second")
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute")
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), "hour")
  if (abs < 604_800) return rtf.format(Math.round(diff / 86_400), "day")
  if (abs < 2_592_000) return rtf.format(Math.round(diff / 604_800), "week")
  if (abs < 31_536_000) return rtf.format(Math.round(diff / 2_592_000), "month")
  return rtf.format(Math.round(diff / 31_536_000), "year")
}
