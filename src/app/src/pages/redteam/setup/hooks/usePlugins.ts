import { useState, useEffect } from 'react';
import { categoryLabels } from '@promptfoo/redteam/constants';

export function usePlugins() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Simulating an API call to fetch plugins
    const fetchPlugins = async () => {
      try {
        // In a real scenario, you'd fetch this data from an API
        // For now, we'll just use the categoryLabels as our plugins
        await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate network delay
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('An unknown error occurred'));
        setLoading(false);
      }
    };

    fetchPlugins();
  }, []);

  return { plugins: categoryLabels, loading, error };
}
