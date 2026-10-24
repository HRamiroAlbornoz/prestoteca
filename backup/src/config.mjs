const DEFAULT_KEEP = 14;

const REQUIRED_VARIABLES = [
  'DATABASE_URL',
  'S3_BUCKET',
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
];

/**
 * Reads and validates the job settings from the environment.
 * Error messages name the variables but never include their values,
 * because several of them are secrets and errors end up in the logs.
 */
export function readConfig(env) {
  const missing = REQUIRED_VARIABLES.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    databaseUrl: env.DATABASE_URL,
    keep: parseKeep(env.BACKUP_KEEP),
    s3: {
      bucket: env.S3_BUCKET,
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  };
}

function parseKeep(rawValue) {
  if (rawValue === undefined || rawValue.trim() === '') return DEFAULT_KEEP;

  // Only plain digits: "2.5", "-3" or "1e2" are rejected instead of being rounded.
  if (!/^\d+$/.test(rawValue.trim()) || Number(rawValue) < 1) {
    throw new Error('BACKUP_KEEP must be a positive integer');
  }
  return Number(rawValue);
}
