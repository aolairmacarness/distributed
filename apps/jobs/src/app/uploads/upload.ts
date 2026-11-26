import * as path from 'path';
import { BadRequestException } from '@nestjs/common';

export const UPLOAD_FILE_PATH = path.join(process.cwd(), 'apps/jobs/uploads');

/** Maximum accepted upload size, in bytes (default 10 MiB). */
export const MAX_UPLOAD_BYTES =
  parseInt(process.env.MAX_UPLOAD_BYTES ?? '', 10) || 10 * 1024 * 1024;

const SAFE_FILE_NAME = /^[A-Za-z0-9_-]+\.json$/;

/**
 * Resolves a client-supplied upload file name to an absolute path inside
 * UPLOAD_FILE_PATH. Rejects anything that is not a bare `<name>.json`
 * file name, so `../` traversal and absolute paths are impossible.
 */
export function resolveUploadPath(fileName: unknown): string {
  if (typeof fileName !== 'string' || !SAFE_FILE_NAME.test(fileName)) {
    throw new BadRequestException('Invalid file name.');
  }
  const resolved = path.resolve(UPLOAD_FILE_PATH, fileName);
  if (path.dirname(resolved) !== path.resolve(UPLOAD_FILE_PATH)) {
    throw new BadRequestException('Invalid file name.');
  }
  return resolved;
}
