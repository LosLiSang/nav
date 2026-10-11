export function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function hostnameOf(value: string): string {
  try {
    return new URL(normalizeUrl(value)).hostname
  } catch {
    return ''
  }
}
