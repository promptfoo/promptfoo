/** Coalesce calls at the trailing edge and allow pending work to be cancelled on cleanup. */
export function debounce<Args extends unknown[], Context>(
  callback: (this: Context, ...args: Args) => void,
  wait: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function debounced(this: Context, ...args: Args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = undefined;
      callback.apply(this, args);
    }, wait);
  }

  debounced.clear = () => {
    clearTimeout(timeout);
    timeout = undefined;
  };

  return debounced;
}
