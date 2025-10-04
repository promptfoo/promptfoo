import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi, fetchUserId } from '@app/utils/api';

/**
 * User data type returned by the unified user hook.
 */
export interface User {
  email: string | null;
  id: string | null;
}

/**
 * Unified hook to fetch current user's email and ID.
 * Makes parallel requests and caches results together for atomic updates.
 * Uses React Query to automatically deduplicate requests.
 * Fail-fast: Does not retry on error.
 */
export function useUser() {
  return useQuery({
    queryKey: ['user'],
    queryFn: async (): Promise<User> => {
      // Fetch both email and ID in parallel
      const [emailResponse, idResult] = await Promise.all([
        callApi('/user/email').catch((err) => {
          console.error('Failed to fetch user email:', err);
          return { ok: false, status: 500 } as Response;
        }),
        fetchUserId().catch((err) => {
          console.error('Failed to fetch user ID:', err);
          return null;
        }),
      ]);

      let email: string | null = null;
      if (emailResponse.ok) {
        try {
          const data = await emailResponse.json();
          email = data.email as string | null;
        } catch (err) {
          console.error('Failed to parse email response:', err);
        }
      } else if (emailResponse.status !== 404) {
        console.error('Failed to fetch user email:', emailResponse.status);
      }

      return {
        email,
        id: idResult,
      };
    },
    staleTime: Infinity, // Cache forever until invalidated
    retry: false, // Fail-fast, don't retry
  });
}


/**
 * Hook to logout the current user.
 * Invalidates all user-related queries on successful logout.
 */
export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await callApi('/user/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.error('Logout failed');
        throw new Error('Logout failed');
      }
    },
    onSettled: () => {
      // Clear all user-related queries even if logout fails
      // This ensures local state is cleared for security
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['cloudConfig'] });
      queryClient.removeQueries({ queryKey: ['user'] });
      queryClient.removeQueries({ queryKey: ['cloudConfig'] });
    },
  });
}

/**
 * Convenience hook to get just the user's email.
 * Returns null if user is not loaded or has no email.
 */
export function useUserEmail() {
  const { data: user, isLoading } = useUser();
  return { email: user?.email ?? null, isLoading };
}

/**
 * Convenience hook to get just the user's ID.
 * Returns null if user is not loaded or has no ID.
 */
export function useUserId() {
  const { data: user, isLoading } = useUser();
  return { id: user?.id ?? null, isLoading };
}

/**
 * Hook to update the user's email in the cache.
 * Useful for optimistic updates without refetching.
 * Updates the unified user object while preserving the ID.
 */
export function useSetUserEmail() {
  const queryClient = useQueryClient();

  return (email: string) => {
    queryClient.setQueryData(['user'], (oldData: User | undefined): User => {
      return {
        email,
        id: oldData?.id ?? null,
      };
    });
  };
}
