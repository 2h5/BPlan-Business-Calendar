import type { SearchResultKind } from '../utils/search-results';

function Icon({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function MagnifierIcon() {
  return (
    <Icon size={18}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Icon>
  );
}

export function ClearIcon() {
  return (
    <Icon size={14}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Icon>
  );
}

export function ResultKindIcon({ kind }: { kind: SearchResultKind }) {
  switch (kind) {
    case 'event':
      return (
        <Icon>
          <rect x="3.5" y="5" width="17" height="15" rx="3" />
          <path d="M3.5 10h17M8 3v4M16 3v4" />
        </Icon>
      );
    case 'task':
      return (
        <Icon>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m8.5 12.2 2.4 2.4 4.6-5" />
        </Icon>
      );
    case 'calendar':
      return (
        <Icon>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <circle cx="12" cy="12" r="2.5" />
        </Icon>
      );
    case 'list':
      return (
        <Icon>
          <path d="M9 6.5h11M9 12h11M9 17.5h11" />
          <circle cx="4.75" cy="6.5" r="0.9" />
          <circle cx="4.75" cy="12" r="0.9" />
          <circle cx="4.75" cy="17.5" r="0.9" />
        </Icon>
      );
  }
}
