import { useEffect } from 'react';

import styles from './PricingPage.module.css';
import { PricingDecals, ProductView, PublicHeader } from '../features/public-site';

export function ProductPage() {
  useEffect(() => {
    document.title = 'BPlan | Product';
  }, []);

  return (
    <div className={styles.page}>
      <PublicHeader activePage="product" />
      <PricingDecals mode="enter" />
      <ProductView />
    </div>
  );
}
