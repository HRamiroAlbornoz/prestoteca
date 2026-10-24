import { describe, expect, it } from 'vitest';
import { dumpDatabase, runCommand, toLibpqEnv, verifyDump } from '../src/postgres.mjs';

const DATABASE_URL = 'postgresql://postgres:very-secret@postgres.railway.internal:5432/railway';

/** Records each call and answers with `output` (or throws `error`), like runCommand would. */
function createFakeRun({ output = '', error } = {}) {
  const calls = [];
  const run = async (command, args, env) => {
    calls.push({ command, args, env });
    if (error) throw error;
    return output;
  };
  return { run, calls };
}

// These tests start a real child process: `node` itself, which is always present.
describe('runCommand', () => {
  it('resolves with what the command printed on stdout', async () => {
    const output = await runCommand(process.execPath, ['-e', 'process.stdout.write("hello")']);

    expect(output).toBe('hello');
  });

  it('passes the extra environment variables to the command', async () => {
    const output = await runCommand(process.execPath, ['-e', 'process.stdout.write(process.env.PGHOST)'], {
      PGHOST: 'db.internal',
    });

    expect(output).toBe('db.internal');
  });

  it('rejects with the exit code and the end of stderr when the command fails', async () => {
    const failing = runCommand(process.execPath, ['-e', 'console.error("connection refused"); process.exit(3)']);

    await expect(failing).rejects.toThrow(/exited with code 3: connection refused/);
  });

  it('rejects when the command does not exist', async () => {
    await expect(runCommand('command-that-does-not-exist-xyz', [])).rejects.toThrow(/ENOENT/);
  });
});

describe('dumpDatabase', () => {
  it('runs pg_dump in custom format, writing to the given file', async () => {
    const { run, calls } = createFakeRun();

    await dumpDatabase(DATABASE_URL, '/tmp/out.dump', run);

    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe('pg_dump');
    expect(calls[0].args).toEqual(['--format=custom', '--no-owner', '--no-acl', '--file=/tmp/out.dump']);
  });

  it('sends the password through the environment, never in the arguments', async () => {
    const { run, calls } = createFakeRun();

    await dumpDatabase(DATABASE_URL, '/tmp/out.dump', run);

    expect(calls[0].env.PGPASSWORD).toBe('very-secret');
    expect(calls[0].args.join(' ')).not.toContain('very-secret');
  });

  it('propagates a pg_dump failure', async () => {
    const { run } = createFakeRun({ error: new Error('pg_dump exited with code 1') });

    await expect(dumpDatabase(DATABASE_URL, '/tmp/out.dump', run)).rejects.toThrow('pg_dump exited with code 1');
  });
});

describe('verifyDump', () => {
  it('accepts a dump whose table of contents lists table data', async () => {
    const { run, calls } = createFakeRun({ output: '; Archive created\n3456; 0 16390 TABLE DATA public users postgres\n' });

    await expect(verifyDump('/tmp/out.dump', run)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ command: 'pg_restore', args: ['--list', '/tmp/out.dump'] });
  });

  it('rejects a dump without any table data', async () => {
    const { run } = createFakeRun({ output: '; Archive created\n; no entries\n' });

    await expect(verifyDump('/tmp/out.dump', run)).rejects.toThrow(/no table data/);
  });

  it('rejects a corrupt dump that pg_restore cannot read', async () => {
    const { run } = createFakeRun({ error: new Error('pg_restore exited with code 1: input file is too short') });

    await expect(verifyDump('/tmp/out.dump', run)).rejects.toThrow(/too short/);
  });
});

describe('toLibpqEnv', () => {
  it('turns a connection URL into the PG* variables that pg_dump reads', () => {
    const env = toLibpqEnv('postgresql://postgres:s3cr%40t@postgres.railway.internal:5432/railway');

    expect(env).toEqual({
      PGHOST: 'postgres.railway.internal',
      PGPORT: '5432',
      PGUSER: 'postgres',
      PGPASSWORD: 's3cr@t',
      PGDATABASE: 'railway',
    });
  });

  it('uses the default Postgres port when the URL has none', () => {
    expect(toLibpqEnv('postgres://user:pass@db.local/app').PGPORT).toBe('5432');
  });

  it('rejects a URL that is not a Postgres URL, without echoing it', () => {
    const read = () => toLibpqEnv('mysql://user:hidden-password@db.local/app');

    expect(read).toThrow(expect.objectContaining({ message: expect.not.stringContaining('hidden-password') }));
  });

  it('rejects a URL without a database name', () => {
    expect(() => toLibpqEnv('postgresql://user:pass@db.local/')).toThrow(/database name/i);
  });
});
