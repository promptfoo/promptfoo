import { useCallback, useMemo } from 'react';

import { EVAL_ROUTES } from '@app/constants/routes';
import { useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { buildEvalUrlWithSearchParams, setEvalDetailsHash } from './utils';

const comparisonEvalIdSchema = z.string().trim().min(1);
const PARAM = 'comparisonEvalIds';

export function useComparisonEvalIds(evalId?: string | null) {
  const location = useLocation();
  const navigate = useNavigate();
  const serializedIds = JSON.stringify(new URLSearchParams(location.search).getAll(PARAM));
  const comparisonEvalIds = useMemo(
    () =>
      [...new Set<string>(JSON.parse(serializedIds))].filter(
        (id) => comparisonEvalIdSchema.safeParse(id).success && id !== evalId,
      ),
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
            for (const id of new Set(ids)) {
              if (comparisonEvalIdSchema.safeParse(id).success && id !== evalId) {
                params.append(PARAM, id);
              }
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
