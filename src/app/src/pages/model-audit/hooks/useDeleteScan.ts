import { useMutation, useQueryClient } from '@tanstack/react-query';
import { callApi } from '@app/utils/api';
import { modelAuditKeys } from './queryKeys';
import type { HistoricalScan } from './types';

interface DeleteScanVariables {
  id: string;
}

interface UseDeleteScanResult {
  deleteScan: (id: string) => Promise<void>;
  isDeleting: boolean;
  error: Error | null;
}

/**
 * React Query mutation hook for deleting a historical scan.
 *
 * Features:
 * - Automatic cache invalidation after successful delete
 * - Optimistic updates (removes from UI immediately)
 * - Automatic rollback on error
 * - Loading and error states
 *
 * @example
 * ```typescript
 * const { deleteScan, isDeleting, error } = useDeleteScan();
 *
 * const handleDelete = async (scanId: string) => {
 *   try {
 *     await deleteScan(scanId);
 *     showToast('Scan deleted successfully', 'success');
 *   } catch (err) {
 *     showToast('Failed to delete scan', 'error');
 *   }
 * };
 * ```
 */
export function useDeleteScan(): UseDeleteScanResult {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ id }: DeleteScanVariables): Promise<void> => {
      const response = await callApi(`/model-audit/scans/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete scan');
      }
    },
    onMutate: async ({ id }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({ queryKey: modelAuditKeys.scans() });

      // Snapshot the previous value
      const previousScans = queryClient.getQueryData(modelAuditKeys.scans());

      // Optimistically update to remove the scan
      queryClient.setQueryData(modelAuditKeys.scans(), (old: HistoricalScan[] | undefined) => {
        return old?.filter((scan) => scan.id !== id) ?? [];
      });

      // Return a context object with the snapshotted value
      return { previousScans };
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousScans) {
        queryClient.setQueryData(modelAuditKeys.scans(), context.previousScans);
      }
    },
    onSettled: () => {
      // PERFORMANCE FIX: Only invalidate on settled (success OR error after rollback)
      // This ensures we refetch to sync with server state, but only once
      // Previously we were refetching immediately after optimistic update (wasteful)
      queryClient.invalidateQueries({ queryKey: modelAuditKeys.scans() });
    },
  });

  return {
    deleteScan: (id: string) => mutation.mutateAsync({ id }),
    isDeleting: mutation.isPending,
    error: mutation.error,
  };
}
