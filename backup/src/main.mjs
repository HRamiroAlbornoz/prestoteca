// Entry point of the cron job: Railway starts it once a day and it must exit when done.
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from './config.mjs';
import { log } from './log.mjs';
import { dumpDatabase, runCommand, verifyDump } from './postgres.mjs';
import { runBackup } from './runBackup.mjs';
import { createStorage } from './storage.mjs';

const filePath = join(tmpdir(), `prestoteca-${process.pid}.dump`);

try {
  const config = readConfig(process.env);
  const storage = createStorage(config.s3);

  // Prints e.g. "pg_dump (PostgreSQL) 18.6" so the logs show which client version ran.
  log('starting backup', { pgDump: (await runCommand('pg_dump', ['--version'])).trim(), keep: config.keep });

  const result = await runBackup({
    now: new Date(),
    keep: config.keep,
    filePath,
    dumpDatabase: (path) => dumpDatabase(config.databaseUrl, path),
    verifyDump,
    uploadBackup: storage.uploadBackup,
    listBackupKeys: storage.listBackupKeys,
    deleteBackup: storage.deleteBackup,
    log,
  });

  log('backup finished', result);
} catch (error) {
  log('backup failed', { error: error.message });
  // A non-zero exit code marks the cron run as failed in Railway.
  process.exitCode = 1;
} finally {
  // The dump holds personal data: never leave it behind in the container.
  await rm(filePath, { force: true });
}
