import { ACCENT_PRESETS, contrastRatio, isAccentPreset } from '@cal/domain';
import { accentColorSchema, DEFAULT_ACCENT_COLOR } from '@cal/schemas';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';

import styles from './AccentPicker.module.css';
import { useCustomAccentAccess, useResolvedAccent } from '../hooks/useAccent';
import { useAppPreferences } from '../hooks/useAppPreferences';
import { applyAccent } from '../utils/accent-style';

/** Dragging in the native picker previews live; the choice is saved once it settles. */
const SAVE_DELAY_MS = 400;

export function AccentPicker() {
  const { setPreference } = useAppPreferences();
  const accent = useResolvedAccent();
  const hasPro = useCustomAccentAccess();
  const isCustom = !isAccentPreset(accent);

  const [hexDraft, setHexDraft] = useState(accent);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setHexDraft(accent), [accent]);
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const save = (color: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    setPreference('accentColor', color);
  };

  const previewThenSave = (color: string) => {
    applyAccent(color);
    setHexDraft(color);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(color), SAVE_DELAY_MS);
  };

  const commitHexDraft = () => {
    const withHash = hexDraft.startsWith('#') ? hexDraft : `#${hexDraft}`;
    const parsed = accentColorSchema.safeParse(withHash.trim());
    if (parsed.success && parsed.data !== accent) save(parsed.data);
    else setHexDraft(accent);
  };

  const onHexKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setHexDraft(accent);
      event.currentTarget.blur();
    }
  };

  return (
    <div className={styles.picker}>
      <div className={styles.heading}>
        <strong id="accent-color-label">Accent color</strong>
        <span>Buttons, highlights, and selections across BPlan.</span>
      </div>

      <div className={styles.swatches} role="radiogroup" aria-labelledby="accent-color-label">
        {ACCENT_PRESETS.map((preset) => {
          const isSelected = accent === preset.color;
          return (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={preset.name}
              title={preset.name}
              className={styles.swatch}
              style={{ backgroundColor: preset.color }}
              onClick={() => save(preset.color)}
            >
              {isSelected ? <CheckIcon /> : null}
            </button>
          );
        })}

        {hasPro === false ? (
          <Link
            to="/subscription"
            className={`${styles.swatch} ${styles.customSwatch} ${styles.lockedSwatch}`}
            aria-label="Custom color, available with Pro"
            title="Custom color is a Pro feature"
          >
            <LockIcon />
          </Link>
        ) : (
          <label
            className={`${styles.swatch} ${styles.customSwatch} ${isCustom ? styles.customSelected : ''}`}
            style={isCustom ? { backgroundColor: accent, color: checkColorOn(accent) } : undefined}
            title="Custom color"
          >
            <input
              type="color"
              className={styles.colorInput}
              value={accent}
              disabled={hasPro === null}
              role="radio"
              aria-checked={isCustom}
              aria-label="Custom color"
              onChange={(event) => previewThenSave(event.target.value.toLowerCase())}
            />
            {isCustom ? <CheckIcon /> : null}
          </label>
        )}
      </div>

      <div className={styles.footer}>
        {hasPro === false ? (
          <p className={styles.upsell}>
            <span className={styles.proBadge}>Pro</span>
            Pick any color with a <Link to="/subscription">Pro plan</Link>.
          </p>
        ) : (
          <label className={styles.hexField}>
            <span>Hex</span>
            <input
              value={hexDraft}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              disabled={hasPro === null}
              aria-label="Custom accent hex value"
              onChange={(event) => setHexDraft(event.target.value)}
              onBlur={commitHexDraft}
              onKeyDown={onHexKeyDown}
            />
          </label>
        )}
        {accent !== DEFAULT_ACCENT_COLOR ? (
          <button type="button" className={styles.reset} onClick={() => save(DEFAULT_ACCENT_COLOR)}>
            Reset to default
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** The swatch shows the color exactly as picked, so its check mark picks its own contrast. */
function checkColorOn(color: string): string {
  return contrastRatio('#ffffff', color) >= 3 ? '#ffffff' : '#0a0d12';
}

function CheckIcon() {
  return (
    <svg className={styles.check} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
