/**
 * Prints one JSON line per event, which Railway's log viewer can filter.
 * Callers must never pass secrets or personal data in `details`.
 */
export function log(message, details = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), message, ...details }));
}
