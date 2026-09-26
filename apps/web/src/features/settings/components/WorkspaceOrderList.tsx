import { WORKSPACE_TABS, type WorkspaceTab } from '@cal/schemas';
import { useEffect, useRef, useState } from 'react';

import styles from './WorkspaceOrderList.module.css';
import { WORKSPACE_NAV } from '../../../components/layout/workspace-nav';
import { useDragReorder } from '../hooks/useDragReorder';
import { moveItem } from '../utils/reorder';

type WorkspaceOrderListProps = {
  order: readonly WorkspaceTab[];
  hiddenTabs: readonly WorkspaceTab[];
  onChange: (next: WorkspaceTab[]) => void;
};

/** Reorders the sidebar's Workspace links by dragging a row or with the move buttons. */
export function WorkspaceOrderList({ order, hiddenTabs, onChange }: WorkspaceOrderListProps) {
  const drag = useDragReorder({ order, onReorder: onChange });
  const listRef = useRef<HTMLOListElement>(null);
  const focusAfterMoveRef = useRef<{ tab: WorkspaceTab; direction: -1 | 1 } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const isDefault = order.every((tab, index) => tab === WORKSPACE_TABS[index]);

  const move = (tab: WorkspaceTab, direction: -1 | 1) => {
    const from = drag.order.indexOf(tab);
    const to = from + direction;
    if (to < 0 || to >= drag.order.length) return;
    focusAfterMoveRef.current = { tab, direction };
    onChange(moveItem(drag.order, from, to));
    setAnnouncement(
      `${WORKSPACE_NAV[tab].label} moved to position ${to + 1} of ${drag.order.length}.`,
    );
  };

  // Once the new order renders, the moved row can have lost focus (it moved in
  // the DOM, or its button became disabled at the end of the list). Keep focus
  // on the same control, or the other one when that is now disabled.
  useEffect(() => {
    const pendingFocus = focusAfterMoveRef.current;
    if (!pendingFocus) return;
    focusAfterMoveRef.current = null;
    const row = listRef.current?.querySelector(`[data-tab="${pendingFocus.tab}"]`);
    const same = row?.querySelector<HTMLButtonElement>(`[data-move="${pendingFocus.direction}"]`);
    const other = row?.querySelector<HTMLButtonElement>(`[data-move="${-pendingFocus.direction}"]`);
    (same && !same.disabled ? same : other)?.focus();
  }, [order]);

  return (
    <div className={styles.wrap}>
      <ol ref={listRef} className={styles.list} aria-label="Workspace order">
        {drag.order.map((tab, index) => {
          const item = WORKSPACE_NAV[tab];
          const isHidden = hiddenTabs.includes(tab);
          return (
            <li
              key={tab}
              ref={drag.register(tab)}
              data-tab={tab}
              style={drag.itemStyle(tab, index)}
              className={`${styles.row} ${drag.draggingKey === tab ? styles.dragging : ''} ${
                isHidden ? styles.hidden : ''
              }`}
              onPointerDown={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest('button')) return;
                // Touch drags start from the grip so the rest of the row still scrolls the page.
                if (event.pointerType === 'touch' && !target.closest('[data-grip]')) return;
                drag.startDrag(tab, event);
              }}
            >
              <span className={styles.grip} data-grip aria-hidden="true">
                <GripIcon />
              </span>
              <span className={styles.icon}>
                <item.icon />
              </span>
              <span className={styles.label}>{item.label}</span>
              {isHidden && <span className={styles.tag}>Hidden</span>}
              <span className={styles.moves}>
                <button
                  type="button"
                  data-move="-1"
                  onClick={() => move(tab, -1)}
                  disabled={index === 0}
                  aria-label={`Move ${item.label} up`}
                >
                  <ChevronIcon up />
                </button>
                <button
                  type="button"
                  data-move="1"
                  onClick={() => move(tab, 1)}
                  disabled={index === drag.order.length - 1}
                  aria-label={`Move ${item.label} down`}
                >
                  <ChevronIcon />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className={styles.footer}>
        <span>Tip: you can also drag the links in the sidebar.</span>
        {!isDefault && (
          <button
            type="button"
            className={styles.reset}
            onClick={() => {
              onChange([...WORKSPACE_TABS]);
              setAnnouncement('Workspace order reset.');
            }}
          >
            Reset order
          </button>
        )}
      </div>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      {[6, 12, 18].map((y) => (
        <g key={y}>
          <circle cx="9" cy={y} r="1.6" />
          <circle cx="15" cy={y} r="1.6" />
        </g>
      ))}
    </svg>
  );
}

function ChevronIcon({ up = false }: { up?: boolean }) {
  return (
    <svg
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
      <polyline points={up ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
    </svg>
  );
}
