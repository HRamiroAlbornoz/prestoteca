// Entry point of the restore check. Run it by hand in staging (see README):
// it proves that the newest backup can actually be restored.
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from './config.mjs';
import { log } from './log.mjs';
import { runCommand, toLibpqEnv } from './postgres.mjs';
import { runRestoreCheck } from './runRestoreCheck.mjs';
import { createStorage } from './storage.mjs';

const filePath = join(tmpdir(), `restore-check-${process.pid}.dump`);

try {
  const config = readConfig(process.env);
  const storage = createStorage(config.s3);

  await runRestoreCheck({
    environmentName: process.env.RAILWAY_ENVIRONMENT_NAME,
    listBackupKeys: storage.listBackupKeys,
    downloadBackup: storage.downloadBackup,
    pgEnv: toLibpqEnv(config.databaseUrl),
    filePath,
    run: runCommand,
    log,
  });
} catch (error) {
  log('restore check failed', { error: error.message });
  process.exitCode = 1;
} finally {
  // The dump holds personal data: never leave it behind in the container.
  await rm(filePath, { force: true });
}
