/** A config without the directory it was run from; `null` and `undefined` pass through. */
type PortableConfig<T> = T extends object ? Omit<T, 'basePath'> : T;

/**
 * Returns a saved eval config without the directory the CLI ran it from.
 *
 * `basePath` only has meaning on the machine that produced the eval, and the web editor
 * rejects configs that carry it, so configs handed to the user (the YAML view, downloads)
 * leave it out. They can then be uploaded again or run with the CLI from any directory.
 */
export function toPortableConfig<T extends object | null | undefined>(
  config: T,
): PortableConfig<T> {
  if (!config || !('basePath' in config)) {
    return config as PortableConfig<T>;
  }
  const { basePath: _basePath, ...portableConfig } = config as T & { basePath?: unknown };
  return portableConfig as PortableConfig<T>;
}
