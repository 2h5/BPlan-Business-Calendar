import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  id?: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

function firstEnabledIndex(options: readonly SelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}

function lastEnabledIndex(options: readonly SelectOption[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) return index;
  }

  return -1;
}

function nextEnabledIndex(
  options: readonly SelectOption[],
  currentIndex: number,
  direction: 1 | -1,
) {
  if (options.length === 0) return -1;

  let index = currentIndex;
  for (let step = 0; step < options.length; step += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }

  return currentIndex;
}

export function Select({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  size = 'md',
  className,
}: SelectProps) {
  const generatedId = useId().replaceAll(':', '');
  const controlId = id ?? `select-${generatedId}`;
  const listboxId = `${controlId}-options`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const defaultHighlightIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options);
  const optionSignature = options
    .map((option) => `${option.value}\u0000${option.label}\u0000${option.disabled ? '1' : '0'}`)
    .join('\u0001');
  const [highlightedIndex, setHighlightedIndex] = useState(defaultHighlightIndex);
  const selectedOption = options[selectedIndex];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setHighlightedIndex(defaultHighlightIndex);
  }, [defaultHighlightIndex, isOpen, optionSignature]);

  function openMenu() {
    if (disabled) return;
    setHighlightedIndex(defaultHighlightIndex);
    setIsOpen(true);
  }

  function chooseOption(option: SelectOption) {
    if (disabled || option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    buttonRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (event.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (event.key === 'Escape') {
      if (!isOpen) return;
      event.preventDefault();
      setIsOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }

      setHighlightedIndex((currentIndex) =>
        nextEnabledIndex(options, currentIndex, event.key === 'ArrowDown' ? 1 : -1),
      );
      return;
    }

    if (event.key === 'Home' || event.key === 'End') {
      if (!isOpen) return;
      event.preventDefault();
      setHighlightedIndex(
        event.key === 'Home' ? firstEnabledIndex(options) : lastEnabledIndex(options),
      );
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }

      const option = options[highlightedIndex];
      if (option) chooseOption(option);
    }
  }

  const rootClassName = className ? `${styles.select} ${className}` : styles.select;
  const triggerClassName = `${styles.trigger} ${
    size === 'sm' ? styles.triggerSmall : ''
  } ${isOpen ? styles.triggerOpen : ''}`;

  return (
    <div ref={rootRef} className={rootClassName}>
      <button
        ref={buttonRef}
        id={controlId}
        type="button"
        className={triggerClassName}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `${listboxId}-${highlightedIndex}` : undefined
        }
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
      >
        <span className={styles.triggerValue}>{selectedOption?.label ?? value}</span>
        <svg
          className={styles.chevron}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div id={listboxId} className={styles.menu} role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isHighlighted = index === highlightedIndex;
            const optionClassName = `${styles.option} ${
              isSelected ? styles.optionSelected : ''
            } ${isHighlighted ? styles.optionHighlighted : ''}`;

            return (
              <button
                key={option.value}
                id={`${listboxId}-${index}`}
                type="button"
                className={optionClassName}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                disabled={option.disabled}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => chooseOption(option)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
