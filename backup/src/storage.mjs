import { readFile, writeFile } from 'node:fs/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { BACKUP_PREFIX } from './backupKey.mjs';

function createS3Client({ endpoint, region, accessKeyId, secretAccessKey }) {
  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // Only send checksums when S3 requires them: some S3-compatible stores
    // reject the extra checksum headers that newer SDK versions add by default.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

/**
 * Wraps the Railway bucket (S3 compatible) in the four operations the job needs.
 * `client` can be replaced by a fake in tests; it only needs a `send(command)` method.
 */
export function createStorage(s3Config, client = createS3Client(s3Config)) {
  const { bucket } = s3Config;

  return {
    // The dump is read into memory: the database is a few KB today, and a
    // Buffer avoids streaming edge cases with S3-compatible providers.
    async uploadBackup(key, filePath) {
      const body = await readFile(filePath);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'application/octet-stream',
        }),
      );
    },

    // ListObjectsV2 returns at most 1000 keys per page, so follow the pages.
    async listBackupKeys() {
      const keys = [];
      let continuationToken;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: BACKUP_PREFIX,
            ContinuationToken: continuationToken,
          }),
        );
        for (const object of page.Contents ?? []) {
          keys.push(object.Key);
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return keys;
    },

    async deleteBackup(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async downloadBackup(key, filePath) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      await writeFile(filePath, await response.Body.transformToByteArray());
    },
  };
}
