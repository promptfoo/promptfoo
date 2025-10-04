import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi, fetchUserId } from '@app/utils/api';

/**
 * Hook to fetch the current user's email.
 * Uses React Query to automatically deduplicate requests and cache results.
 * Fail-fast: Does not retry on error.
 */
export function useUserEmail() {
  return useQuery({
    queryKey: ['user', 'email'],
    queryFn: async () => {
      const response = await callApi('/user/email');
      if (response.ok) {
        const data = await response.json();
        return data.email as string | null;
      }
      // Handle 404 and other errors uniformly
      if (response.status !== 404) {
        console.error('Failed to fetch user email:', response.status);
      }
      return null;
    },
    staleTime: Infinity, // Cache forever until invalidated
    retry: false, // Fail-fast, don't retry
  });
}

/**
 * Hook to fetch the current user's ID.
 * Uses React Query to automatically deduplicate requests and cache results.
 * Fail-fast: Does not retry on error.
 */
export function useUserId() {
  return useQuery({
    queryKey: ['user', 'id'],
    queryFn: async () => {
      try {
        const userId = await fetchUserId();
        return userId || null;
      } catch (error) {
        console.error('Error fetching user ID:', error);
        return null;
      }
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
 * Hook to update the user's email in the cache.
 * Useful for optimistic updates without refetching.
 */
export function useSetUserEmail() {
  const queryClient = useQueryClient();

  return (email: string) => {
    queryClient.setQueryData(['user', 'email'], email);
  };
}
