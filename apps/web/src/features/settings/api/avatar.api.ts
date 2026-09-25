import { type Profile, uuidSchema } from '@cal/schemas';
import { z } from 'zod';

import { updateProfile } from './settings.api';
import { toAppError } from '../../../lib/errors/app-error';
import { supabase } from '../../../lib/supabase/client';
import { type CropState, MAX_ZOOM, MIN_ZOOM } from '../utils/avatar-crop';

/**
 * Each user's folder in the public `avatars` bucket holds two objects:
 * - `avatar`: the 256px square shown everywhere, carrying its framing as metadata.
 * - `original`: the full photo, downscaled, so the framing can be adjusted later
 *   without re-uploading or going soft.
 */
const AVATAR_BUCKET = 'avatars';
const AVATAR_CACHE_SECONDS = 60 * 60 * 24 * 365;

const avatarPaths = (userId: string) => {
  const folder = uuidSchema.parse(userId);
  return { avatar: `${folder}/avatar`, original: `${folder}/original` };
};

/** Framing stored on the avatar object. Storage metadata is external input, so it is validated. */
const cropMetadataSchema = z.object({
  crop: z.object({
    zoom: z.number().min(MIN_ZOOM).max(MAX_ZOOM),
    x: z.number().finite(),
    y: z.number().finite(),
  }),
});

export interface AvatarUpload {
  avatar: Blob;
  crop: CropState;
  /** Set when a new photo was picked; omitted when only the framing changed. */
  original?: Blob;
}

/**
 * Stores the avatar (and a new original, if any) and points the profile at it.
 * The version query string changes on every upload, so the long cache lifetime
 * never serves a replaced photo.
 */
export async function uploadAvatar(userId: string, upload: AvatarUpload): Promise<Profile> {
  const paths = avatarPaths(userId);
  const bucket = supabase.storage.from(AVATAR_BUCKET);

  if (upload.original) {
    const { error } = await bucket.upload(paths.original, upload.original, {
      upsert: true,
      contentType: upload.original.type,
      // Only read back for re-cropping, where a cached copy of a replaced photo would be wrong.
      cacheControl: '0',
    });
    if (error) throw toAppError(error);
  }

  const { error: avatarError } = await bucket.upload(paths.avatar, upload.avatar, {
    upsert: true,
    contentType: upload.avatar.type,
    cacheControl: String(AVATAR_CACHE_SECONDS),
    metadata: { crop: upload.crop },
  });
  if (avatarError) throw toAppError(avatarError);

  const { publicUrl } = bucket.getPublicUrl(paths.avatar).data;
  const avatarUrl = z.string().url().parse(`${publicUrl}?v=${Date.now()}`);
  return updateProfile(userId, { avatarUrl });
}

/** True when the profile photo lives in this user's bucket folder (not a Google/Microsoft photo). */
export function isStoredAvatarUrl(userId: string, avatarUrl: string | null): boolean {
  if (!avatarUrl) return false;
  const { publicUrl } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(avatarPaths(userId).avatar).data;
  return avatarUrl.split('?')[0] === publicUrl;
}

/**
 * The photo and framing to reopen the cropper with. Photos saved before
 * originals were kept fall back to the avatar itself, framed from scratch.
 */
export async function fetchAvatarForCropping(
  userId: string,
): Promise<{ image: Blob; crop: CropState | null }> {
  const paths = avatarPaths(userId);
  const bucket = supabase.storage.from(AVATAR_BUCKET);

  const original = await bucket.download(paths.original);
  if (original.data) {
    const info = await bucket.info(paths.avatar);
    const parsed = cropMetadataSchema.safeParse(info.data?.metadata);
    return { image: original.data, crop: parsed.success ? parsed.data.crop : null };
  }

  const avatar = await bucket.download(paths.avatar);
  if (avatar.error) throw toAppError(avatar.error);
  return { image: avatar.data, crop: null };
}

/** Deletes the stored photo and its original, and falls back to initials. */
export async function removeAvatar(userId: string): Promise<Profile> {
  const paths = avatarPaths(userId);
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .remove([paths.avatar, paths.original]);
  if (error) throw toAppError(error);
  return updateProfile(userId, { avatarUrl: null });
}
