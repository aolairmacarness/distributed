import { BadRequestException } from '@nestjs/common';
import { join } from 'path';
import { resolveUploadPath, UPLOAD_FILE_PATH } from './upload';

describe('resolveUploadPath', () => {
  it('resolves a plain upload file name inside the uploads directory', () => {
    expect(resolveUploadPath('file-123-456.json')).toBe(
      join(UPLOAD_FILE_PATH, 'file-123-456.json'),
    );
  });

  it.each([
    '../../../package.json',
    '..%2Fpackage.json',
    '/etc/passwd',
    'sub/dir.json',
    '..',
    'file.txt',
    '.json',
    '',
    42,
    undefined,
    { toString: () => 'a.json' },
  ])('rejects %p', (fileName) => {
    expect(() => resolveUploadPath(fileName)).toThrow(BadRequestException);
  });
});
