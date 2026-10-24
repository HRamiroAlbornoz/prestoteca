# db-backup

Cron job that backs up the Prestoteca Postgres database once a day and keeps the last 14 copies
in a Railway bucket.

Each run: `pg_dump` (custom format) → `pg_restore --list` to check the file → upload to the bucket
→ delete the copies beyond the limit → exit. If any step before the upload fails, no old copy is
deleted. A failed run exits with code 1, so Railway marks it as failed.

Backups contain personal data (emails, password hashes). They only live in the private bucket and
in the container's temporary folder, which the job empties before exiting.

## Railway service settings

The service has no `railway.json` (Railway deprecated Config as Code), so these live in the
service settings:

| Setting | Value |
|---|---|
| Root directory | `backup` (the `Dockerfile` here is detected automatically) |
| Start command | `node src/main.mjs` |
| Cron schedule | `0 6 * * *` (06:00 UTC, 03:00 in Argentina) |
| Restart policy | `Never` (a cron run must not be retried in a loop) |
| Watch paths | `backup/**` |

## Variables

Set them as references, so no secret is copied by hand:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (private network) |
| `S3_BUCKET` | `${{<bucket>.BUCKET}}` |
| `S3_ENDPOINT` | `${{<bucket>.ENDPOINT}}` |
| `S3_REGION` | `${{<bucket>.REGION}}` |
| `S3_ACCESS_KEY_ID` | `${{<bucket>.ACCESS_KEY_ID}}` |
| `S3_SECRET_ACCESS_KEY` | `${{<bucket>.SECRET_ACCESS_KEY}}` |
| `BACKUP_KEEP` | Optional. How many copies to keep (default `14`) |

## Tests

```bash
npm test               # run the tests
npm run test:coverage  # same, and fail if line coverage of src/ drops below 80%
```

The tests replace Postgres and the bucket with in-memory fakes; they never touch Railway.
`main.mjs` and `restoreCheck.mjs` are thin entry points: they are proven by running them in staging.

## Check that a backup restores (staging only)

`npm run restore-check` restores the newest copy into a scratch database `restore_check`, compares
the row counts of `users`, `tools` and `loans` with the source database, and drops the scratch
database. It refuses to run when `RAILWAY_ENVIRONMENT_NAME` is `production`.

To run it in staging:

1. Change the service's start command to `node src/restoreCheck.mjs`.
2. Make a **new** deployment (`railway up ./backup --path-as-root -s db-backup -e staging`, or a
   variable change). A *redeploy* reuses the previous deployment's settings, start command included.
3. Trigger a run: `railway cron run -s db-backup -e staging --yes`. Deploying alone does not run the job.
4. Read the logs: `restore check passed` and the row counts.
5. Put the start command back to `node src/main.mjs` and make a new deployment again.

## Restore production from a backup

Only after a data loss, and with the app stopped so nobody writes during the restore.

1. Download the copy: Railway → the bucket → **Files** → `postgres/prestoteca-<date>.dump`.
2. Install the PostgreSQL **18** client tools on your machine (`pg_restore --version` must say 18).
3. In the Postgres service, enable a temporary **TCP proxy** and copy `DATABASE_PUBLIC_URL`.
4. Restore, replacing the current tables:

   ```bash
   pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error \
     --dbname="<DATABASE_PUBLIC_URL>" prestoteca-<date>.dump
   ```

5. Remove the TCP proxy, start the app again and check `/api/health`.
6. Delete the downloaded `.dump` file from your machine.
