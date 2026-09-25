import { describe, expect, it } from 'vitest';

import { AVATAR_MAX_INPUT_BYTES, AvatarImageError, assertAvatarFile } from './avatar-image';

function fileOf(type: string, size = 1024): File {
  const file = new File(['x'], 'photo', { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('assertAvatarFile', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', (type) => {
    expect(() => assertAvatarFile(fileOf(type))).not.toThrow();
  });

  it.each(['image/gif', 'image/heic', 'application/pdf', ''])('rejects %s', (type) => {
    expect(() => assertAvatarFile(fileOf(type))).toThrow(AvatarImageError);
  });

  it('rejects files over the input limit', () => {
    expect(() => assertAvatarFile(fileOf('image/jpeg', AVATAR_MAX_INPUT_BYTES + 1))).toThrow(
      'under 15 MB',
    );
  });
});
