function base32ToBytes(base32: string): Uint8Array {
  const cleaned = base32.toUpperCase().replace(/[\s=-]/g, '')
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (let i = 0; i < cleaned.length; i++) {
    const idx = alphabet.indexOf(cleaned[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(bytes)
}

export async function generateTotp(
  secret: string,
  timeSec: number = Math.floor(Date.now() / 1000),
  step: number = 30,
  digits: number = 6,
): Promise<{ code: string; remainingSec: number; progress: number }> {
  const epoch = Math.floor(timeSec / step)
  const remainingSec = step - (timeSec % step)
  const progress = remainingSec / step

  try {
    const secretBytes = base32ToBytes(secret)
    if (secretBytes.length === 0) {
      return { code: '000000', remainingSec, progress }
    }

    const counterBuffer = new ArrayBuffer(8)
    const counterView = new DataView(counterBuffer)
    counterView.setUint32(0, Math.floor(epoch / 0x100000000), false)
    counterView.setUint32(4, epoch & 0xffffffff, false)

    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes as unknown as BufferSource,
      { name: 'HMAC', hash: { name: 'SHA-1' } },
      false,
      ['sign'],
    )

    const hmac = await crypto.subtle.sign('HMAC', key, counterBuffer)
    const hmacBytes = new Uint8Array(hmac)
    const offset = hmacBytes[hmacBytes.length - 1] & 0x0f
    const binary =
      ((hmacBytes[offset] & 0x7f) << 24) |
      ((hmacBytes[offset + 1] & 0xff) << 16) |
      ((hmacBytes[offset + 2] & 0xff) << 8) |
      (hmacBytes[offset + 3] & 0xff)

    const mod = 10 ** digits
    const code = (binary % mod).toString().padStart(digits, '0')
    return { code, remainingSec, progress }
  } catch {
    return { code: '------', remainingSec, progress }
  }
}
