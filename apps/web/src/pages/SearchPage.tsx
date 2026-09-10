import { useEffect } from 'react';

import { SearchView } from '../features/search/components/SearchView';

export function SearchPage() {
  useEffect(() => {
    document.title = 'BPlan | Search';
  }, []);

  return <SearchView />;
}
