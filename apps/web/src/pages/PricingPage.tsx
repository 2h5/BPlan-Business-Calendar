import { useEffect } from 'react';

import styles from './PricingPage.module.css';
import { PublicPricingView } from '../features/billing/components/PublicPricingView';
import { PricingDecals, PublicHeader } from '../features/public-site';

export function PricingPage() {
  useEffect(() => {
    document.title = 'BPlan | Pricing';
  }, []);

  return (
    <div className={styles.page}>
      <PublicHeader activePage="pricing" />
      <PricingDecals mode="enter" />
      <PublicPricingView />
    </div>
  );
}
