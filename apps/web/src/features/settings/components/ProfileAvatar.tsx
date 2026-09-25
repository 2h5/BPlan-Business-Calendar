import { useState } from 'react';

import styles from './ProfileAvatar.module.css';

interface ProfileAvatarProps {
  /** Name or email used for the initial when there is no photo. */
  label: string | null | undefined;
  imageUrl: string | null | undefined;
  /** Sizing and color come from the caller so each placement keeps its look. */
  className?: string;
}

/** The user's photo, falling back to their initial when unset or unreachable. */
export function ProfileAvatar({ label, imageUrl, className }: ProfileAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;
  const initial = (label?.trim() || 'B').slice(0, 1).toUpperCase();

  return (
    <span className={`${styles.avatar} ${className ?? ''}`} aria-hidden="true">
      {showImage ? (
        <img
          className={styles.image}
          src={imageUrl ?? undefined}
          alt=""
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl ?? null)}
        />
      ) : (
        initial
      )}
    </span>
  );
}
