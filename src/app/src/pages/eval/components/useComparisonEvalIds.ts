import { useCallback, useMemo } from 'react';

import { EVAL_ROUTES } from '@app/constants/routes';
import { useLocation, useNavigate } from 'react-router';
import { buildEvalUrlWithSearchParams, setEvalDetailsHash } from './utils';

const PARAM = 'comparisonEvalIds';

function uniqueIds(ids: string[], evalId?: string | null) {
  return [...new Set(ids.map((id) => id.trim()))].filter((id) => id && id !== evalId);
}

export function useComparisonEvalIds(evalId?: string | null) {
  const location = useLocation();
  const navigate = useNavigate();
  const serializedIds = JSON.stringify(new URLSearchParams(location.search).getAll(PARAM));
  const comparisonEvalIds = useMemo(
    () => uniqueIds(JSON.parse(serializedIds), evalId),
    [serializedIds, evalId],
  );

  const setComparisonEvalIds = useCallback(
    (ids: string[]) => {
      setEvalDetailsHash('');
      navigate(
        buildEvalUrlWithSearchParams(
          {
            // Pin comparisons started from the latest-eval route to a durable base eval.
            pathname: evalId ? EVAL_ROUTES.DETAIL(evalId) : location.pathname,
            search: location.search,
            hash: '',
          },
          (params) => {
            params.delete(PARAM);
            params.delete('rowId');
            for (const id of uniqueIds(ids, evalId)) {
              params.append(PARAM, id);
            }
          },
        ),
        { replace: true },
      );
    },
    [evalId, location.pathname, location.search, navigate],
  );

  return [comparisonEvalIds, setComparisonEvalIds] as const;
}
