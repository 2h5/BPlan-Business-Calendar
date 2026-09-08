import type { ReactNode } from 'react';

import styles from './PageTransition.module.css';

interface PageTransitionProps {
  children: ReactNode;
  contentKey: string;
}

export function PageTransition({ children, contentKey }: PageTransitionProps) {
  return (
    <div key={contentKey} className={styles.content}>
      {children}
    </div>
  );
}
