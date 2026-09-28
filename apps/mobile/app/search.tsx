import { useAuth } from '../src/features/auth';
import { SearchScreen } from '../src/features/search/screens/SearchScreen';

export default function SearchScreenRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return null;

  return <SearchScreen />;
}
