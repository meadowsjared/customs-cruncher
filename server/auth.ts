import crypto from 'node:crypto'

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'customs-cruncher-admin-secret-2026'
const ADMIN_PASSWORD = process.env.ADMIN_WEB_PASSWORD || ''

interface TokenPayload {
  role: string
  iat: number
  exp: number
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  return Buffer.from(base64, 'base64').toString('utf8')
}

function sign(payloadStr: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url')
}

function isTokenPayload(value: unknown): value is TokenPayload {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  if (!('role' in value && 'iat' in value && 'exp' in value)) {
    return false
  }
  return (
    typeof value.role === 'string' &&
    typeof value.iat === 'number' &&
    typeof value.exp === 'number'
  )
}

export function checkAdminUsername(username: string | undefined | null): boolean {
  const configured = (process.env.ADMIN_WEB_USERNAME || 'admin').trim().toLowerCase()
  if (!username || typeof username !== 'string') {
    return false
  }
  const clean = username.trim().toLowerCase()
  return clean === configured || clean === 'admin' || clean === 'jmeadows'
}

export function checkAdminPassword(password: string): boolean {
  const configuredPassword = process.env.ADMIN_WEB_PASSWORD || ADMIN_PASSWORD
  if (!configuredPassword) {
    return false
  }
  if (typeof password !== 'string') {
    return false
  }

  const bufA = Buffer.from(password)
  const bufB = Buffer.from(configuredPassword)
  if (bufA.length !== bufB.length) {
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

export function checkAdminGateSlug(slug: string | undefined | null): boolean {
  const configuredSlug = process.env.ADMIN_GATE_SLUG
  if (!configuredSlug || typeof slug !== 'string') {
    return false
  }

  const bufA = Buffer.from(slug)
  const bufB = Buffer.from(configuredSlug)
  if (bufA.length !== bufB.length) {
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

export function createAdminToken(expiresInHours = 168): { token: string; expiresAt: number } {
  const now = Date.now()
  const exp = now + expiresInHours * 60 * 60 * 1000
  const secret = process.env.ADMIN_JWT_SECRET || JWT_SECRET

  const payload: TokenPayload = {
    role: 'admin',
    iat: now,
    exp,
  }

  const payloadStr = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(payloadStr, secret)
  const token = `${payloadStr}.${signature}`

  return { token, expiresAt: exp }
}

export function verifyAdminToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== 'string') {
    return false
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return false
  }

  const [payloadStr, signature] = parts
  if (!payloadStr || !signature) {
    return false
  }

  const secret = process.env.ADMIN_JWT_SECRET || JWT_SECRET
  const expectedSignature = sign(payloadStr, secret)

  const sigBufA = Buffer.from(signature)
  const sigBufB = Buffer.from(expectedSignature)

  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    return false
  }

  try {
    const jsonStr = base64UrlDecode(payloadStr)
    const payload: unknown = JSON.parse(jsonStr)
    if (!isTokenPayload(payload)) {
      return false
    }

    if (payload.role !== 'admin') {
      return false
    }

    if (payload.exp < Date.now()) {
      return false
    }

    return true
  } catch {
    return false
  }
}

export function extractBearerToken(authHeader: string | undefined | null): string | null {
  if (!authHeader || typeof authHeader !== 'string') {
    return null
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}
