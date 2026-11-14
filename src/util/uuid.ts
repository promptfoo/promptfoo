const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Matches versioned RFC 9562 UUIDs, excluding the Nil and Max sentinels. */
export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}
