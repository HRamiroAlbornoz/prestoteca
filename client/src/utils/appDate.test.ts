import { describe, expect, it } from 'vitest'
import { APP_TIME_ZONE, todayInAppTimeZone } from './appDate'

// Same cases as the server's helper: both sides must agree on what "today" is.
// Each case passes an explicit instant, so the result never depends on the browser's time zone.
describe('todayInAppTimeZone', () => {
  it('uses the time zone the spec asks for', () => {
    expect(APP_TIME_ZONE).toBe('America/Argentina/Tucuman')
  })

  it('returns the previous day between 00:00 and 03:00 UTC (21:00 to 24:00 in Tucumán)', () => {
    expect(todayInAppTimeZone(new Date('2026-11-03T01:30:00Z'))).toBe('2026-11-02')
  })

  it('returns the same day as UTC from 03:00 UTC on', () => {
    expect(todayInAppTimeZone(new Date('2026-11-03T03:00:00Z'))).toBe('2026-11-03')
  })

  it('handles the change of year', () => {
    expect(todayInAppTimeZone(new Date('2027-01-01T02:59:59Z'))).toBe('2026-12-31')
  })
})
