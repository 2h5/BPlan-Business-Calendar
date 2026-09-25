import { useEffect, useRef, useState } from 'react';

import { AvatarCropDialog } from './AvatarCropDialog';
import { ProfileAvatar } from './ProfileAvatar';
import styles from './ProfilePhotoField.module.css';
import {
  useCanCropAvatar,
  useLoadAvatarForCropping,
  useRemoveAvatar,
  useUploadAvatar,
} from '../hooks/useAvatar';
import type { CropState } from '../utils/avatar-crop';
import { AVATAR_ACCEPT, loadAvatarBitmap } from '../utils/avatar-image';

interface ProfilePhotoFieldProps {
  label: string | null | undefined;
  imageUrl: string | null;
}

interface Editor {
  bitmap: ImageBitmap;
  initialCrop: CropState | null;
  /** A newly picked photo; its original is stored so it can be re-cropped later. */
  isNewPhoto: boolean;
}

/**
 * Pick a photo or re-frame the current one in the crop dialog, then save.
 * Saves immediately, apart from the profile form.
 */
export function ProfilePhotoField({ label, imageUrl }: ProfilePhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadAvatar();
  const loadForCrop = useLoadAvatarForCropping();
  const remove = useRemoveAvatar();
  const canCrop = useCanCropAvatar(imageUrl);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const isBusy = isOpening || loadForCrop.isPending || upload.isPending || remove.isPending;
  // Upload errors show inside the dialog while it is open.
  const error =
    pickError ??
    (loadForCrop.error ? errorMessage(loadForCrop.error) : null) ??
    (remove.error ? errorMessage(remove.error) : null);

  // Decoded photos hold real memory; release each one when it is replaced or closed.
  const bitmap = editor?.bitmap;
  useEffect(() => () => bitmap?.close(), [bitmap]);

  const resetMessages = () => {
    setPickError(null);
    upload.reset();
    loadForCrop.reset();
    remove.reset();
  };

  const openEditor = (next: Editor) => {
    setIsClosing(false);
    setEditor(next);
  };

  const openFile = async (file: File) => {
    resetMessages();
    setIsOpening(true);
    try {
      openEditor({ bitmap: await loadAvatarBitmap(file), initialCrop: null, isNewPhoto: true });
    } catch (loadError) {
      setPickError(errorMessage(loadError));
    } finally {
      setIsOpening(false);
    }
  };

  const openCurrent = () => {
    resetMessages();
    loadForCrop.mutate(undefined, {
      onSuccess: ({ bitmap: current, crop }) =>
        openEditor({ bitmap: current, initialCrop: crop, isNewPhoto: false }),
    });
  };

  return (
    <div className={styles.field}>
      <div className={`${styles.preview} ${isBusy ? styles.previewBusy : ''}`}>
        <ProfileAvatar label={label} imageUrl={imageUrl} className={styles.avatar} />
        {isBusy && <span className={styles.spinner} aria-hidden="true" />}
      </div>

      <div className={styles.body}>
        <strong>Profile photo</strong>
        <span className={styles.hint}>
          PNG, JPEG, or WebP. You can crop and zoom before saving.
        </span>
        {error && (
          <span className={styles.error} role="alert">
            {error}
          </span>
        )}
      </div>

      <div className={styles.actions}>
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className={styles.fileInput}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear so picking the same file again still fires a change.
            event.target.value = '';
            if (file) void openFile(file);
          }}
        />
        <button
          type="button"
          className={styles.button}
          disabled={isBusy}
          onClick={() => inputRef.current?.click()}
        >
          {isOpening ? 'Opening…' : imageUrl ? 'Change photo' : 'Upload photo'}
        </button>
        {canCrop && (
          <button type="button" className={styles.button} disabled={isBusy} onClick={openCurrent}>
            {loadForCrop.isPending ? 'Opening…' : 'Crop'}
          </button>
        )}
        {imageUrl && (
          <button
            type="button"
            className={styles.textButton}
            disabled={isBusy}
            onClick={() => {
              resetMessages();
              remove.mutate();
            }}
          >
            {remove.isPending ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>

      {editor && (
        <AvatarCropDialog
          bitmap={editor.bitmap}
          initialCrop={editor.initialCrop}
          isSaving={upload.isPending}
          isClosing={isClosing}
          error={upload.error ? errorMessage(upload.error) : null}
          onCancel={() => setIsClosing(true)}
          onSave={(crop) =>
            upload.mutate(
              { bitmap: editor.bitmap, crop, isNewPhoto: editor.isNewPhoto },
              { onSuccess: () => setIsClosing(true) },
            )
          }
          onExited={() => {
            upload.reset();
            setEditor(null);
            setIsClosing(false);
          }}
        />
      )}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = String(error.message);
    if (message) return message;
  }
  return 'Your photo could not be saved. Please try again.';
}
