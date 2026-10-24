import { spawn } from 'node:child_process';

/**
 * Converts a connection URL into the PG* variables that every Postgres tool
 * (pg_dump, pg_restore, psql) reads. Passing the password through the
 * environment keeps it out of the process list, unlike a --dbname argument.
 */
export function toLibpqEnv(databaseUrl) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }

  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must start with postgresql:// or postgres://');
  }

  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database) {
    throw new Error('DATABASE_URL must include a database name');
  }

  return {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };
}

/**
 * Runs a command and resolves with its standard output.
 * Rejects when the command cannot start or exits with a non-zero code;
 * the error carries the end of stderr so the logs show what went wrong.
 */
export function runCommand(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...extraEnv } });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.trim().slice(-500)}`));
      }
    });
  });
}

/**
 * Dumps the whole database to `filePath` in pg_dump's custom format:
 * compressed, and restorable table by table with pg_restore.
 * --no-owner and --no-acl let the copy be restored under a different user.
 * `run` defaults to runCommand; tests pass a fake to check the exact call.
 */
export async function dumpDatabase(databaseUrl, filePath, run = runCommand) {
  await run(
    'pg_dump',
    ['--format=custom', '--no-owner', '--no-acl', `--file=${filePath}`],
    toLibpqEnv(databaseUrl),
  );
}

/**
 * Reads the table of contents of the dump. A truncated or corrupt file
 * makes pg_restore fail, so a broken backup is caught before it is uploaded.
 */
export async function verifyDump(filePath, run = runCommand) {
  const tableOfContents = await run('pg_restore', ['--list', filePath]);
  if (!tableOfContents.includes('TABLE DATA')) {
    throw new Error('pg_restore --list found no table data in the dump');
  }
}
