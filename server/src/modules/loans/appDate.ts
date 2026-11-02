// "Today" for the app, as the spec defines it: the date in the neighbourhood's time zone.
// Railway runs in UTC, so between 21:00 and 24:00 in Tucumán the UTC date is already tomorrow.
// The client has a copy of this helper (client/src/utils/appDate.ts): keep both in sync.
export const APP_TIME_ZONE = 'America/Argentina/Tucuman'

const dateParts = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Returns the date as YYYY-MM-DD, the same format the loans table and the date inputs use
export function todayInAppTimeZone(now: Date = new Date()): string {
  const parts = dateParts.formatToParts(now)
  const get = (type: 'year' | 'month' | 'day') => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
