import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import styles from './AvatarCropDialog.module.css';
import { useCropGestures } from '../hooks/useCropGestures';
import {
  clampCrop,
  cropSourceRect,
  type CropState,
  INITIAL_CROP,
  MAX_ZOOM,
  MIN_ZOOM,
  zoomCrop,
} from '../utils/avatar-crop';

interface AvatarCropDialogProps {
  bitmap: ImageBitmap;
  /** Framing to reopen with when adjusting an existing photo. */
  initialCrop: CropState | null;
  isSaving: boolean;
  /** Plays the exit animation; `onExited` fires once it has finished. */
  isClosing: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (crop: CropState) => void;
  onExited: () => void;
}

const ZOOM_BUTTON_FACTOR = 1.25;
const PREVIEW_SIZES = [56, 36] as const;

/** Square crop with a circular guide. Drag, pinch, scroll, slider, or keyboard to frame the photo. */
export function AvatarCropDialog({
  bitmap,
  initialCrop,
  isSaving,
  isClosing,
  error,
  onCancel,
  onSave,
  onExited,
}: AvatarCropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [crop, setCrop] = useState<CropState>(() =>
    initialCrop ? clampCrop(bitmap, initialCrop) : INITIAL_CROP,
  );
  const image = { width: bitmap.width, height: bitmap.height };
  const isLocked = isSaving || isClosing;
  const { stageRef, isDragging } = useCropGestures({ image, setCrop, disabled: isLocked });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const restoreFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    stageRef.current?.focus();
    return () => {
      dialog.close();
      restoreFocus?.focus();
    };
  }, [stageRef]);

  const draw = useCallback(() => {
    const rect = cropSourceRect(bitmap, crop);
    const targets = [canvasRef.current, ...previewRefs.current];
    for (const canvas of targets) {
      if (!canvas) continue;
      const cssSize = canvas.clientWidth;
      const pixels = Math.max(1, Math.round(cssSize * window.devicePixelRatio));
      if (canvas.width !== pixels) canvas.width = canvas.height = pixels;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.imageSmoothingQuality = 'high';
      context.clearRect(0, 0, pixels, pixels);
      context.drawImage(bitmap, rect.sx, rect.sy, rect.size, rect.size, 0, 0, pixels, pixels);
    }
  }, [bitmap, crop]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  // Redraw at the right pixel density when the stage resizes (rotation, window resize).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw]);

  const zoomTo = (zoom: number) => setCrop((current) => zoomCrop(bitmap, current, zoom));
  const zoomPercent = ((crop.zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * 100;
  const isInitial = crop.zoom === MIN_ZOOM && crop.x === 0 && crop.y === 0;

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${isClosing ? styles.dialogClosing : ''}`}
      aria-labelledby="avatar-crop-title"
      aria-describedby="avatar-crop-hint"
      onCancel={(event) => {
        event.preventDefault();
        if (!isLocked) onCancel();
      }}
      onAnimationEnd={(event) => {
        if (isClosing && event.target === event.currentTarget) onExited();
      }}
    >
      <header className={styles.header}>
        <h2 id="avatar-crop-title">Adjust your photo</h2>
        <p id="avatar-crop-hint">Drag to reposition. Scroll, pinch, or use the slider to zoom.</p>
      </header>

      <div className={styles.body}>
        <div
          ref={stageRef}
          className={`${styles.stage} ${isDragging ? styles.stageDragging : ''}`}
          tabIndex={0}
          role="group"
          aria-label="Photo framing. Arrow keys move the photo, plus and minus zoom, 0 resets."
        >
          <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
          <div className={styles.mask} aria-hidden="true" />
          <div className={styles.grid} aria-hidden="true" />
        </div>

        <div className={styles.zoomRow}>
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => zoomTo(crop.zoom / ZOOM_BUTTON_FACTOR)}
            disabled={isLocked || crop.zoom <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            <ImageIcon size={14} />
          </button>
          <input
            type="range"
            className={styles.slider}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            disabled={isLocked}
            aria-label="Zoom"
            aria-valuetext={`${Math.round(crop.zoom * 100)}%`}
            style={{ '--fill': `${zoomPercent}%` } as CSSProperties}
            onChange={(event) => zoomTo(Number(event.target.value))}
          />
          <button
            type="button"
            className={styles.zoomButton}
            onClick={() => zoomTo(crop.zoom * ZOOM_BUTTON_FACTOR)}
            disabled={isLocked || crop.zoom >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            <ImageIcon size={20} />
          </button>
        </div>

        <div className={styles.previewRow} aria-hidden="true">
          <span>Preview</span>
          {PREVIEW_SIZES.map((size, index) => (
            <canvas
              key={size}
              ref={(node) => {
                previewRefs.current[index] = node;
              }}
              className={styles.preview}
              style={{ width: size, height: size }}
            />
          ))}
        </div>
      </div>

      <footer className={styles.footer}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <button
            type="button"
            className={styles.resetButton}
            onClick={() => setCrop(clampCrop(bitmap, INITIAL_CROP))}
            disabled={isLocked || isInitial}
          >
            Reset
          </button>
        )}
        <div className={styles.footerActions}>
          <button type="button" className={styles.secondary} onClick={onCancel} disabled={isLocked}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onSave(crop)}
            disabled={isLocked}
          >
            {isSaving && <span className={styles.spinner} aria-hidden="true" />}
            {isSaving ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </footer>
    </dialog>
  );
}

function ImageIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
    </svg>
  );
}
