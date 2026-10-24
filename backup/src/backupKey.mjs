// Every backup lives under this folder of the bucket.
export const BACKUP_PREFIX = 'postgres/';

// Only files with exactly this shape were created by the job, so only these
// can ever be deleted by the retention step.
const BACKUP_KEY_PATTERN = /^postgres\/prestoteca-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.dump$/;

/**
 * Builds the object key for a backup taken at `date`.
 * Example: 2026-10-24T06:00:07.123Z -> postgres/prestoteca-2026-10-24T06-00-07Z.dump
 * The UTC timestamp goes first, so sorting the keys alphabetically sorts them by date.
 */
export function buildBackupKey(date) {
  const timestamp = date
    .toISOString() // 2026-10-24T06:00:07.123Z
    .replace(/\.\d{3}Z$/, 'Z') // drop the milliseconds
    .replaceAll(':', '-'); // colons are awkward in file names on Windows

  return `${BACKUP_PREFIX}prestoteca-${timestamp}.dump`;
}

export function isBackupKey(key) {
  return BACKUP_KEY_PATTERN.test(key);
}

/**
 * Given every key in the bucket, returns the backups that exceed the `keep` limit
 * (the oldest ones). Keys that the job did not create are never returned.
 */
export function selectExpiredKeys(keys, keep) {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error(`keep must be a positive integer, received ${keep}`);
  }

  const newestFirst = keys.filter(isBackupKey).sort().reverse();
  return newestFirst.slice(keep);
}
