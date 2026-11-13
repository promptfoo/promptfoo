/** Decode a URL component while retaining malformed escapes as written. */
export function decodeUrlComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
