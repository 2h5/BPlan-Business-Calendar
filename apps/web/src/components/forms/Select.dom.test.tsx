// @vitest-environment jsdom
import '../../test/dom';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Select, type SelectOption } from './Select';

// Enabled: Banana (1), Date (3), Elderberry (4). Both ends are disabled so
// Home/End and wrapping must skip them.
const options: SelectOption[] = [
  { value: 'apple', label: 'Apple', disabled: true },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry', disabled: true },
  { value: 'date', label: 'Date' },
  { value: 'elder', label: 'Elderberry' },
  { value: 'fig', label: 'Fig', disabled: true },
];

type SelectProps = ComponentProps<typeof Select>;

function ControlledSelect({
  initialValue = 'date',
  onChange,
  ...rest
}: Partial<SelectProps> & { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <>
      <Select
        id="fruit"
        ariaLabel="Fruit"
        options={options}
        {...rest}
        value={value}
        onChange={(next) => {
          onChange?.(next);
          setValue(next);
        }}
      />
      <button type="button">After</button>
    </>
  );
}

function renderSelect(props: Partial<SelectProps> & { initialValue?: string } = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const view = render(<ControlledSelect onChange={onChange} {...props} />);
  return { ...view, user, onChange };
}

function trigger() {
  return screen.getByRole('combobox', { name: 'Fruit' });
}

function listbox() {
  return screen.queryByRole('listbox', { name: 'Fruit' });
}

function option(name: string) {
  return screen.getByRole('option', { name });
}

function highlighted() {
  const id = trigger().getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
}

describe('Select pointer interaction', () => {
  it('exposes a closed combobox wired to its listbox', () => {
    renderSelect();

    expect(trigger()).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('aria-controls', 'fruit-options');
    expect(trigger()).not.toHaveAttribute('aria-activedescendant');
    expect(trigger()).toHaveTextContent('Date');
    expect(listbox()).not.toBeInTheDocument();
  });

  it('opens on click with the selected option highlighted and ARIA state in sync', async () => {
    const { user } = renderSelect();

    await user.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(listbox()).toHaveAttribute('id', 'fruit-options');
    expect(highlighted()).toBe(option('Date'));
    expect(option('Date')).toHaveAttribute('aria-selected', 'true');
    expect(option('Banana')).toHaveAttribute('aria-selected', 'false');
    expect(option('Apple')).toBeDisabled();
    expect(option('Apple')).toHaveAttribute('aria-disabled', 'true');
    expect(option('Banana')).not.toHaveAttribute('aria-disabled');
  });

  it('closes when the trigger is clicked again without changing the value', async () => {
    const { user, onChange } = renderSelect();

    await user.click(trigger());
    await user.click(trigger());

    expect(listbox()).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects a clicked option, closes, and returns focus to the trigger', async () => {
    const { user, onChange } = renderSelect();

    await user.click(trigger());
    await user.click(option('Elderberry'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('elder');
    expect(listbox()).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveTextContent('Elderberry');
  });

  it('ignores clicks on disabled options and stays open', async () => {
    const { user, onChange } = renderSelect();

    await user.click(trigger());
    await user.click(option('Cherry'));

    expect(onChange).not.toHaveBeenCalled();
    expect(listbox()).toBeInTheDocument();
  });

  it('moves the highlight with the pointer', async () => {
    const { user } = renderSelect();

    await user.click(trigger());
    await user.hover(option('Banana'));

    expect(highlighted()).toBe(option('Banana'));
  });

  it('stays open for presses inside the menu and closes for presses outside', async () => {
    const { user, onChange } = renderSelect();

    await user.click(trigger());
    await user.click(listbox() as HTMLElement);
    expect(listbox()).toBeInTheDocument();

    await user.click(document.body);
    expect(listbox()).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes when another Select opens, and the two keep distinct listbox IDs', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Select value="banana" options={options} onChange={vi.fn()} ariaLabel="First" />
        <Select value="date" options={options} onChange={vi.fn()} ariaLabel="Second" />
      </>,
    );
    const first = screen.getByRole('combobox', { name: 'First' });
    const second = screen.getByRole('combobox', { name: 'Second' });

    expect(first.getAttribute('aria-controls')).not.toBe(second.getAttribute('aria-controls'));

    await user.click(first);
    await user.click(second);

    expect(screen.queryByRole('listbox', { name: 'First' })).not.toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Second' })).toHaveAttribute(
      'id',
      second.getAttribute('aria-controls'),
    );
  });
});

describe('Select keyboard interaction', () => {
  it('opens with ArrowDown or ArrowUp without moving off the selected option', async () => {
    const { user, onChange } = renderSelect();

    await user.tab();
    expect(trigger()).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toBe(option('Date'));

    await user.keyboard('{Escape}{ArrowUp}');
    expect(highlighted()).toBe(option('Date'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('moves over enabled options only and wraps in both directions', async () => {
    const { user } = renderSelect({ initialValue: 'banana' });

    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toBe(option('Banana'));

    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toBe(option('Date'));
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toBe(option('Elderberry'));
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toBe(option('Banana'));
    await user.keyboard('{ArrowUp}');
    expect(highlighted()).toBe(option('Elderberry'));
  });

  it('jumps to the first and last enabled options with Home and End only while open', async () => {
    const { user } = renderSelect();

    await user.tab();
    await user.keyboard('{Home}');
    expect(listbox()).not.toBeInTheDocument();

    await user.keyboard('{Enter}{End}');
    expect(highlighted()).toBe(option('Elderberry'));
    await user.keyboard('{Home}');
    expect(highlighted()).toBe(option('Banana'));
  });

  it('opens with Enter and chooses the highlighted option with Enter', async () => {
    const { user, onChange } = renderSelect();

    await user.tab();
    await user.keyboard('{Enter}');
    expect(listbox()).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard('{ArrowUp}{Enter}');

    expect(onChange).toHaveBeenCalledWith('banana');
    expect(listbox()).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveTextContent('Banana');
  });

  it('opens and chooses with Space', async () => {
    const { user, onChange } = renderSelect();

    await user.tab();
    await user.keyboard(' ');
    expect(listbox()).toBeInTheDocument();

    await user.keyboard('{ArrowDown} ');

    expect(onChange).toHaveBeenCalledWith('elder');
    expect(listbox()).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('does not choose a disabled selected option with Enter', async () => {
    const { user, onChange } = renderSelect({ initialValue: 'cherry' });

    await user.tab();
    await user.keyboard('{Enter}');
    expect(highlighted()).toBe(option('Cherry'));

    await user.keyboard('{Enter}');

    expect(onChange).not.toHaveBeenCalled();
    expect(listbox()).toBeInTheDocument();
  });

  it('closes on Escape without choosing, and prevents the default only while open', async () => {
    const { user, onChange } = renderSelect();
    const seen: boolean[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.defaultPrevented);
    document.addEventListener('keydown', listener);

    try {
      await user.tab();
      await user.keyboard('{ArrowDown}{ArrowDown}{Escape}');

      expect(listbox()).not.toBeInTheDocument();
      expect(trigger()).toHaveFocus();
      expect(trigger()).toHaveTextContent('Date');
      expect(onChange).not.toHaveBeenCalled();

      await user.keyboard('{Escape}');
      expect(seen.slice(-2)).toEqual([true, false]);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('closes on Tab and moves focus past the menu to the next control', async () => {
    const { user, onChange } = renderSelect();

    await user.tab();
    await user.keyboard('{ArrowDown}');
    await user.tab();

    expect(listbox()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Select state changes', () => {
  it('cannot be opened or focused while disabled', async () => {
    const { user, onChange } = renderSelect({ disabled: true });

    await user.click(trigger());
    expect(listbox()).not.toBeInTheDocument();

    await user.tab();
    expect(trigger()).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an unknown value as-is and highlights the first enabled option', async () => {
    const { user } = renderSelect({ initialValue: 'kiwi' });

    expect(trigger()).toHaveTextContent('kiwi');
    await user.click(trigger());

    expect(highlighted()).toBe(option('Banana'));
    expect(screen.queryAllByRole('option', { selected: true })).toHaveLength(0);
  });

  it('follows value and option changes made while open', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <Select value="date" options={options} onChange={onChange} ariaLabel="Fruit" />,
    );

    await user.click(trigger());
    await user.keyboard('{ArrowDown}');
    expect(highlighted()).toBe(option('Elderberry'));

    rerender(<Select value="banana" options={options} onChange={onChange} ariaLabel="Fruit" />);
    expect(highlighted()).toBe(option('Banana'));
    expect(option('Banana')).toHaveAttribute('aria-selected', 'true');

    const shorter = [
      { value: 'grape', label: 'Grape', disabled: true },
      { value: 'honeydew', label: 'Honeydew' },
    ];
    rerender(<Select value="banana" options={shorter} onChange={onChange} ariaLabel="Fruit" />);
    expect(highlighted()).toBe(option('Honeydew'));
    expect(trigger()).toHaveTextContent('banana');

    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('honeydew');
  });
});
