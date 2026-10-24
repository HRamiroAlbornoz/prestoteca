import { describe, expect, it } from 'vitest';
import { buildBackupKey } from '../src/backupKey.mjs';
import { runRestoreCheck, SCRATCH_DATABASE } from '../src/runRestoreCheck.mjs';

const PG_ENV = { PGHOST: 'postgres.railway.internal', PGPORT: '5432', PGUSER: 'postgres', PGPASSWORD: 'pw', PGDATABASE: 'railway' };
const keyForDay = (day) => buildBackupKey(new Date(Date.UTC(2026, 9, day, 6)));

/**
 * Fake Postgres: answers `SELECT count(*)` with the counts of the database the
 * query targets, and records every command so the tests can check the order.
 */
function createFakes({
  keys = [keyForDay(22), keyForDay(24), keyForDay(23)],
  sourceCounts = { users: 10, tools: 3, loans: 3 },
  restoredCounts = { users: 10, tools: 3, loans: 3 },
  failRestore = false,
} = {}) {
  const commands = [];
  const downloads = [];

  const run = async (command, args, env) => {
    const sql = args.at(-1);
    commands.push({ command, sql, database: env.PGDATABASE });
    if (command === 'pg_restore' && failRestore) throw new Error('pg_restore exited with code 1');
    const table = /FROM (\w+)$/.exec(sql)?.[1];
    if (table) {
      const counts = env.PGDATABASE === SCRATCH_DATABASE ? restoredCounts : sourceCounts;
      return `${counts[table]}\n`;
    }
    return '';
  };

  const deps = {
    environmentName: 'staging',
    listBackupKeys: async () => [...keys, 'postgres/manual-copy.dump'],
    downloadBackup: async (key, filePath) => downloads.push({ key, filePath }),
    pgEnv: PG_ENV,
    filePath: '/tmp/restore.dump',
    run,
    log: () => {},
  };

  return { deps, commands, downloads };
}

const isDropScratch = ({ sql }) => sql?.startsWith(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`);

describe('runRestoreCheck', () => {
  it('restores the newest backup and reports matching row counts', async () => {
    const { deps, downloads } = createFakes();

    const result = await runRestoreCheck(deps);

    expect(downloads).toEqual([{ key: keyForDay(24), filePath: '/tmp/restore.dump' }]);
    expect(result).toEqual({
      key: keyForDay(24),
      source: { users: 10, tools: 3, loans: 3 },
      restored: { users: 10, tools: 3, loans: 3 },
    });
  });

  it('restores into the scratch database, never into the source one', async () => {
    const { deps, commands } = createFakes();

    await runRestoreCheck(deps);

    const restore = commands.find(({ command }) => command === 'pg_restore');
    expect(restore.sql).toBe('/tmp/restore.dump');
    const writes = commands.filter(({ sql }) => /^(CREATE|DROP)/.test(sql ?? ''));
    expect(writes.every(({ sql }) => sql.includes(SCRATCH_DATABASE))).toBe(true);
  });

  it('drops the scratch database at the end of a successful check', async () => {
    const { deps, commands } = createFakes();

    await runRestoreCheck(deps);

    expect(isDropScratch(commands.at(-1))).toBe(true);
  });

  it('fails when the restored row counts differ, and still drops the scratch database', async () => {
    const { deps, commands } = createFakes({ restoredCounts: { users: 9, tools: 3, loans: 3 } });

    await expect(runRestoreCheck(deps)).rejects.toThrow(/row counts differ/);
    expect(isDropScratch(commands.at(-1))).toBe(true);
  });

  it('drops the scratch database when pg_restore fails', async () => {
    const { deps, commands } = createFakes({ failRestore: true });

    await expect(runRestoreCheck(deps)).rejects.toThrow(/pg_restore/);
    expect(isDropScratch(commands.at(-1))).toBe(true);
  });

  it('refuses to run in production without touching the bucket or Postgres', async () => {
    const { deps, commands, downloads } = createFakes();

    await expect(runRestoreCheck({ ...deps, environmentName: 'production' })).rejects.toThrow(/outside production/);
    expect(commands).toEqual([]);
    expect(downloads).toEqual([]);
  });

  it('fails clearly when the bucket has no backups', async () => {
    const { deps, commands } = createFakes({ keys: [] });

    await expect(runRestoreCheck(deps)).rejects.toThrow(/no backups/);
    expect(commands).toEqual([]);
  });
});
