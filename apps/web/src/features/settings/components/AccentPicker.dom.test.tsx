// @vitest-environment jsdom
import '../../../test/dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AccentPicker } from './AccentPicker';

const setPreference = vi.fn();
let accent = '#1768f2';
let hasPro: boolean | null = false;

vi.mock('../hooks/useAppPreferences', () => ({
  useAppPreferences: () => ({ setPreference }),
}));
vi.mock('../hooks/useAccent', () => ({
  useResolvedAccent: () => accent,
  useCustomAccentAccess: () => hasPro,
}));

function renderPicker() {
  return render(
    <MemoryRouter>
      <AccentPicker />
    </MemoryRouter>,
  );
}

describe('AccentPicker', () => {
  beforeEach(() => {
    setPreference.mockReset();
    accent = '#1768f2';
    hasPro = false;
  });

  it('lets anyone pick a preset', async () => {
    renderPicker();
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Violet' }));
    expect(setPreference).toHaveBeenCalledWith('accentColor', '#7c3aed');
  });

  it('locks the custom color behind Pro', () => {
    renderPicker();
    expect(screen.getByRole('link', { name: 'Custom color, available with Pro' })).toHaveAttribute(
      'href',
      '/subscription',
    );
    expect(screen.queryByLabelText('Custom accent hex value')).not.toBeInTheDocument();
  });

  it('saves a valid hex for Pro users and ignores an invalid one', async () => {
    hasPro = true;
    renderPicker();
    const hex = screen.getByLabelText('Custom accent hex value');

    await userEvent.clear(hex);
    await userEvent.type(hex, 'nope{Enter}');
    expect(setPreference).not.toHaveBeenCalled();
    expect(hex).toHaveValue('#1768f2');

    await userEvent.clear(hex);
    await userEvent.type(hex, '12AB34{Enter}');
    expect(setPreference).toHaveBeenCalledWith('accentColor', '#12ab34');
  });

  it('offers a reset once the accent is not the default', async () => {
    accent = '#db2777';
    renderPicker();
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(setPreference).toHaveBeenCalledWith('accentColor', '#1768f2');
  });
});
