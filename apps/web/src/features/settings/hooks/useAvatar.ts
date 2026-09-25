import { useMutation, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '../../../lib/query/query-client';
import { useAuth } from '../../auth';
import {
  fetchAvatarForCropping,
  isStoredAvatarUrl,
  removeAvatar,
  uploadAvatar,
} from '../api/avatar.api';
import { type CropState, cropSourceRect } from '../utils/avatar-crop';
import { loadAvatarBitmap, renderAvatarBlob, renderOriginalBlob } from '../utils/avatar-image';

function requireUserId(userId: string | null | undefined): string {
  if (!userId) throw new Error('Expected an authenticated user');
  return userId;
}

interface SaveAvatarInput {
  bitmap: ImageBitmap;
  crop: CropState;
  /** True for a newly picked photo, whose original is kept for later re-cropping. */
  isNewPhoto: boolean;
}

/** Renders the framed square (and the original, for a new photo), uploads, and updates the profile. */
export function useUploadAvatar() {
  const client = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async ({ bitmap, crop, isNewPhoto }: SaveAvatarInput) => {
      const id = requireUserId(userId);
      const [avatar, original] = await Promise.all([
        renderAvatarBlob(bitmap, cropSourceRect(bitmap, crop)),
        isNewPhoto ? renderOriginalBlob(bitmap) : Promise.resolve(undefined),
      ]);
      return uploadAvatar(id, { avatar, crop, original });
    },
    onSuccess: (profile) => client.setQueryData(queryKeys.profile(), profile),
  });
}

/** Loads the kept original and its last framing to reopen the cropper. */
export function useLoadAvatarForCropping() {
  const { userId } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { image, crop } = await fetchAvatarForCropping(requireUserId(userId));
      return { bitmap: await loadAvatarBitmap(image), crop };
    },
  });
}

export function useRemoveAvatar() {
  const client = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: () => removeAvatar(requireUserId(userId)),
    onSuccess: (profile) => client.setQueryData(queryKeys.profile(), profile),
  });
}

/** Only photos in this user's bucket folder can be re-cropped; provider photos cannot be read back. */
export function useCanCropAvatar(avatarUrl: string | null): boolean {
  const { userId } = useAuth();
  return userId ? isStoredAvatarUrl(userId, avatarUrl) : false;
}
