import { isBackupKey } from './backupKey.mjs';

export const SCRATCH_DATABASE = 'restore_check';
// Fixed list, never built from input, so it is safe to put in the SQL below.
const TABLES = ['users', 'tools', 'loans'];

/**
 * Restores the newest backup into a scratch database, compares row counts with
 * the source database and drops the scratch database again, even on failure.
 * The source database is only read. Like runBackup, every step that talks to the
 * bucket or Postgres is passed in, so the tests can use fakes.
 */
export async function runRestoreCheck({
  environmentName,
  listBackupKeys,
  downloadBackup,
  pgEnv,
  filePath,
  run,
  log,
}) {
  if (environmentName === 'production') {
    throw new Error('restore-check only runs outside production');
  }

  const newestKey = (await listBackupKeys()).filter(isBackupKey).sort().at(-1);
  if (!newestKey) throw new Error('There are no backups in the bucket');
  log('restoring backup', { key: newestKey, into: SCRATCH_DATABASE });

  await downloadBackup(newestKey, filePath);

  const psql = (sql, database = pgEnv.PGDATABASE) =>
    run('psql', ['--tuples-only', '--no-align', '--command', sql], { ...pgEnv, PGDATABASE: database });
  // WITH (FORCE) closes any connection left open by a failed restore.
  const dropScratchDatabase = () => psql(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE} WITH (FORCE)`);

  const countRows = async (database) => {
    const counts = {};
    for (const table of TABLES) {
      counts[table] = Number((await psql(`SELECT count(*) FROM ${table}`, database)).trim());
    }
    return counts;
  };

  await dropScratchDatabase(); // leftover from an earlier run that crashed
  await psql(`CREATE DATABASE ${SCRATCH_DATABASE}`);

  try {
    await run(
      'pg_restore',
      ['--no-owner', '--no-acl', '--exit-on-error', `--dbname=${SCRATCH_DATABASE}`, filePath],
      pgEnv,
    );

    const source = await countRows(pgEnv.PGDATABASE);
    const restored = await countRows(SCRATCH_DATABASE);
    const matches = TABLES.every((table) => source[table] === restored[table]);
    log('row counts', { source, restored, matches });

    if (!matches) {
      throw new Error('Restored row counts differ from the source database');
    }
    log('restore check passed', { key: newestKey });
    return { key: newestKey, source, restored };
  } finally {
    await dropScratchDatabase();
    log('scratch database dropped', { database: SCRATCH_DATABASE });
  }
}
