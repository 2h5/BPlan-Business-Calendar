import { useEffect } from 'react';

import styles from './PricingPage.module.css';
import { PublicPricingView } from '../features/billing/components/PublicPricingView';
import { PublicHeader } from '../features/public-site';

export function PricingPage() {
  useEffect(() => {
    document.title = 'BPlan | Pricing';
  }, []);

  return (
    <div className={styles.page}>
      <PublicHeader activePage="pricing" />
      <div className={styles.leftShapes} aria-hidden="true" />
      <div className={styles.rightShapes} aria-hidden="true" />
      <PublicPricingView />
    </div>
  );
}
