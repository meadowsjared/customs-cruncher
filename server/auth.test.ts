import { describe, expect, it } from 'bun:test'
import {
  checkAdminGateSlug,
  checkAdminPassword,
  createAdminToken,
  extractBearerToken,
  verifyAdminToken,
} from './auth'

describe('server/auth', () => {
  it('extracts bearer token correctly', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def')
    expect(extractBearerToken('bearer abc.def')).toBe('abc.def')
    expect(extractBearerToken('Basic abc')).toBe(null)
    expect(extractBearerToken(undefined)).toBe(null)
    expect(extractBearerToken('')).toBe(null)
  })

  it('creates and verifies valid admin tokens', () => {
    const { token, expiresAt } = createAdminToken(1)
    expect(expiresAt).toBeGreaterThan(Date.now())
    expect(verifyAdminToken(token)).toBe(true)
  })

  it('rejects tampered or malformed tokens', () => {
    const { token } = createAdminToken(1)
    expect(verifyAdminToken(`${token}tampered`)).toBe(false)
    expect(verifyAdminToken('not.a.valid.token')).toBe(false)
    expect(verifyAdminToken('')).toBe(false)
    expect(verifyAdminToken(null)).toBe(false)
  })

  it('rejects expired tokens', () => {
    const { token } = createAdminToken(-1) // expired 1 hour ago
    expect(verifyAdminToken(token)).toBe(false)
  })

  it('verifies admin password matching process.env.ADMIN_WEB_PASSWORD', () => {
    const current = process.env.ADMIN_WEB_PASSWORD || ''
    if (current) {
      expect(checkAdminPassword(current)).toBe(true)
      expect(checkAdminPassword('wrong-password')).toBe(false)
    }
  })

  it('verifies admin gate slug matching process.env.ADMIN_GATE_SLUG', () => {
    const currentSlug = process.env.ADMIN_GATE_SLUG || ''
    if (currentSlug) {
      expect(checkAdminGateSlug(currentSlug)).toBe(true)
      expect(checkAdminGateSlug('wrong-slug')).toBe(false)
      expect(checkAdminGateSlug(undefined)).toBe(false)
    }
  })
})
