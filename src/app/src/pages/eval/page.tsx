import Eval from '@app/pages/eval/components/Eval';
import { useLocation, useParams, useSearchParams } from 'react-router';
import FilterModeProvider from './components/FilterModeProvider';

function getRouteEvalId(pathname: string, routeParam?: string): string | undefined {
  if (!routeParam) {
    return;
  }
  // React Router turns both an encoded slash and literal "%2F" into "/".
  // Read the original segment to distinguish the two stored IDs.
  const segment = pathname.split('/').filter(Boolean).at(-1);
  try {
    return segment ? decodeURIComponent(segment) : routeParam;
  } catch {
    return routeParam;
  }
}

export default function EvalPage() {
  const { evalId } = useParams();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const searchEvalId = searchParams.get('evalId');
  const fetchId = getRouteEvalId(pathname, evalId) || searchEvalId;
  return (
    <FilterModeProvider>
      <Eval fetchId={fetchId} />
    </FilterModeProvider>
  );
}
