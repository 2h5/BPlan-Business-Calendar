import type { SourceRect } from './avatar-crop';

/** Longest edge of the stored square avatar. Displayed at 36-56px, so 256 covers 3x+ screens. */
export const AVATAR_SIZE = 256;

/**
 * Longest edge of the kept original, used to re-crop later. At the 4x max zoom
 * the visible square is still >= 400px, so re-cropping never looks soft.
 */
export const AVATAR_ORIGINAL_MAX_EDGE = 1600;
const AVATAR_ORIGINAL_FALLBACK_EDGE = 1200;
/** Stay under the avatars bucket's 2 MiB object limit with headroom. */
const AVATAR_ORIGINAL_MAX_BYTES = 1.8 * 1024 * 1024;

/** Formats the browser can decode here and the avatars bucket accepts after re-encoding. */
export const AVATAR_ACCEPT = 'image/png,image/jpeg,image/webp';

/** Raw pick limit. Phone photos run 3-8 MB; the stored result is ~15-40 KB. */
export const AVATAR_MAX_INPUT_BYTES = 15 * 1024 * 1024;

const ACCEPTED_TYPES = new Set(AVATAR_ACCEPT.split(','));

export class AvatarImageError extends Error {}

/** Rejects files the picker should not have let through, before any decoding work. */
export function assertAvatarFile(file: Blob): void {
  if (!ACCEPTED_TYPES.has(file.type)) {
    throw new AvatarImageError('Choose a PNG, JPEG, or WebP image.');
  }
  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new AvatarImageError('Choose an image under 15 MB.');
  }
}

/** Validates and decodes a picked file or stored original, upright, for the cropper. The caller closes it. */
export async function loadAvatarBitmap(file: Blob): Promise<ImageBitmap> {
  assertAvatarFile(file);
  try {
    // Honors EXIF orientation so phone photos are not rotated sideways.
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new AvatarImageError('That image could not be read. Try a different file.');
  }
}

/**
 * Renders the chosen square at AVATAR_SIZE and encodes it. Re-encoding also
 * strips EXIF metadata such as GPS location.
 */
export async function renderAvatarBlob(bitmap: ImageBitmap, rect: SourceRect): Promise<Blob> {
  const target = Math.max(1, Math.round(Math.min(AVATAR_SIZE, rect.size)));
  return encode(bitmap, { sx: rect.sx, sy: rect.sy, sw: rect.size, sh: rect.size }, target, target);
}

/** Downscales the full picked image for later re-cropping, also without EXIF metadata. */
export async function renderOriginalBlob(bitmap: ImageBitmap): Promise<Blob> {
  for (const maxEdge of [AVATAR_ORIGINAL_MAX_EDGE, AVATAR_ORIGINAL_FALLBACK_EDGE]) {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const full = { sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height };
    const blob = await encode(bitmap, full, width, height);
    if (blob.size <= AVATAR_ORIGINAL_MAX_BYTES) return blob;
  }
  throw new AvatarImageError('That image is too detailed to store. Try a smaller photo.');
}

/** WebP is preferred; browsers that cannot encode it (older Safari) fall back to JPEG. */
async function encode(
  bitmap: ImageBitmap,
  source: { sx: number; sy: number; sw: number; sh: number },
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new AvatarImageError('Your browser could not process that image.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, source.sx, source.sy, source.sw, source.sh, 0, 0, width, height);

  const webp = await toBlob(canvas, 'image/webp', 0.86);
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.88);
  if (jpeg) return jpeg;
  throw new AvatarImageError('Your browser could not process that image.');
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
