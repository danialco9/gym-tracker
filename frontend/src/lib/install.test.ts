import { describe, expect, it } from 'vitest'
import { needsIosInstall } from './install'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'

const browser = (userAgent: string, overrides = {}) => ({
  userAgent,
  platform: 'iPhone',
  maxTouchPoints: 5,
  displayStandalone: false,
  ...overrides,
})

describe('needsIosInstall', () => {
  it('is true on an iPhone browsing the site', () => {
    expect(needsIosInstall(browser(IPHONE_UA))).toBe(true)
  })

  it('is false once opened from the home screen icon', () => {
    expect(needsIosInstall(browser(IPHONE_UA, { standalone: true }))).toBe(false)
    expect(needsIosInstall(browser(IPHONE_UA, { displayStandalone: true }))).toBe(false)
  })

  it('tells an iPad, which says it is a Mac, from a real Mac', () => {
    expect(needsIosInstall(browser(MAC_UA, { platform: 'MacIntel', maxTouchPoints: 5 }))).toBe(true)
    expect(needsIosInstall(browser(MAC_UA, { platform: 'MacIntel', maxTouchPoints: 0 }))).toBe(false)
  })

  it('is false on Android, where notifications work in the browser', () => {
    expect(needsIosInstall(browser(ANDROID_UA, { platform: 'Linux armv8l' }))).toBe(false)
  })
})
