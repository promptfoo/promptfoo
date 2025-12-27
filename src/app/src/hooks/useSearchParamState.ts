import { useCallback, useMemo } from 'react';

import { useSearchParams } from 'react-router-dom';
import invariant from 'tiny-invariant';
import type { ZodSchema } from 'zod';

/**
 * Store state in the URL search params. Use like you would use `useState`.
 * @param key - the search param key.
 * @param schema - The Zod schema to use to parse the search param value.
 * @param defaultValue - An optional default value to use if the search param is not set.
 *  `null` is used to represent inexistent search params.
 * @returns [value, setter] - The value and setter function.
 */
export const useSearchParamState = <T extends string = string>(
  key: string,
  schema: ZodSchema<T>,
  defaultValue: T | null = null,
): [T | null, (value: T | null) => void] => {
  const [searchParams, setSearchParams] = useSearchParams();

  const setter = useCallback(
    /**
     * Set the value of the search param.
     * @param value - The value to set the search param to. If null, the search param will be deleted.
     *  Do not use empty strings to represent empty values. Use null instead.
     */
    (value: T | null) => {
      // Invariant to prevent using empty strings to represent empty values.
      invariant(
        value !== '',
        'Do not use empty strings to represent empty values. Use null instead.',
      );
      setSearchParams((params) => {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
        return params;
      });
    },
    [key, setSearchParams],
  );

  /**
   * Read the value of the search param from the URL query string. If the search param is not set, return the default value.
   * If the search param is set, parse it using the schema and return the parsed value.
   * If the search param is set but cannot be parsed using the schema, return the default value.
   * @returns The value of the search param or the default value.
   */
  const value = useMemo((): T | null => {
    const searchParamValue = searchParams.get(key);
    if (searchParamValue === null) {
      return defaultValue;
    }
    const result = schema.safeParse(searchParamValue);
    return result.success ? result.data : defaultValue;
  }, [searchParams, key, defaultValue, schema]);

  return [value, setter];
};
