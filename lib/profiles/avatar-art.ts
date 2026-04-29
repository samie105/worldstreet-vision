/** Curated still-life and abstract imagery for viewer avatars (no emoji). */
export const PROFILE_ART_IMAGES = [
  "https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1513519245081-0e79729e4a79?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1507643176403-66ce5da17f88?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1501472312651-726afe119ff1?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1460661419201-fd563dea41cb?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?auto=format&fit=crop&w=480&h=480&q=85",
  "https://images.unsplash.com/photo-1514901592197-6210e7a3e2ee?auto=format&fit=crop&w=480&h=480&q=85",
] as const

export function profileArtForId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i += 1) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  }
  const idx = Math.abs(h) % PROFILE_ART_IMAGES.length
  return PROFILE_ART_IMAGES[idx]!
}
