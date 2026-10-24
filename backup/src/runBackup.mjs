import { buildBackupKey, selectExpiredKeys } from './backupKey.mjs';

/**
 * One backup run, in a fixed order: dump -> verify -> upload -> delete old copies.
 * Every step that talks to Postgres or the bucket is passed in as a function,
 * so the tests can replace them with in-memory fakes.
 *
 * If any step before the upload fails, the error propagates and nothing is
 * deleted: the old copies are only removed once the new one is safely stored.
 */
export async function runBackup({
  now,
  keep,
  filePath,
  dumpDatabase,
  verifyDump,
  uploadBackup,
  listBackupKeys,
  deleteBackup,
  log,
}) {
  const key = buildBackupKey(now);

  await dumpDatabase(filePath);
  await verifyDump(filePath);
  await uploadBackup(key, filePath);
  log('backup uploaded', { key });

  // The copy just uploaded is excluded explicitly, so a clock that jumped
  // backwards can never make the job delete its own fresh backup.
  const expiredKeys = selectExpiredKeys(await listBackupKeys(), keep).filter(
    (expiredKey) => expiredKey !== key,
  );

  // Try every deletion even if one fails, then report the failures together.
  const deleted = [];
  const failed = [];
  for (const expiredKey of expiredKeys) {
    try {
      await deleteBackup(expiredKey);
      deleted.push(expiredKey);
    } catch (error) {
      failed.push(`${expiredKey} (${error.message})`);
    }
  }
  log('old backups deleted', { deleted });

  if (failed.length > 0) {
    throw new Error(`Backup ${key} was uploaded, but these old copies could not be deleted: ${failed.join(', ')}`);
  }

  return { key, deleted };
}
