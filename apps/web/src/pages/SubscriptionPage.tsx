import { useEffect } from 'react';

import { SubscriptionView } from '../features/billing';

export function SubscriptionPage() {
  useEffect(() => {
    document.title = 'BPlan | Plans & Subscription';
  }, []);

  return <SubscriptionView />;
}
