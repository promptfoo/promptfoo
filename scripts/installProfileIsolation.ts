import fs from 'node:fs';
import path from 'node:path';

/**
 * Ensure a consumer's real directory cannot resolve undeclared dependencies from the
 * checkout or another ancestor installation. Call after creating the root, before
 * copying artifacts or installing packages. The consumer's own node_modules is allowed.
 */
export function assertIsolatedConsumerRoot(root: string, checkoutRoot: string): void {
  const canonicalRoot = fs.realpathSync(root);
  const canonicalCheckout = fs.realpathSync(checkoutRoot);
  if (!fs.statSync(canonicalRoot).isDirectory()) {
    throw new Error('Consumer root must be a directory.');
  }

  const relativeToCheckout = path.relative(canonicalCheckout, canonicalRoot);
  if (
    relativeToCheckout === '' ||
    (!path.isAbsolute(relativeToCheckout) &&
      relativeToCheckout !== '..' &&
      !relativeToCheckout.startsWith(`..${path.sep}`))
  ) {
    throw new Error('Consumer root must be outside the checkout.');
  }

  let ancestor = path.dirname(canonicalRoot);
  while (true) {
    const nodeModules = path.join(ancestor, 'node_modules');
    // lstat includes dangling symlinks, which an existence check would miss.
    if (fs.lstatSync(nodeModules, { throwIfNoEntry: false })) {
      throw new Error(`Consumer root has an ancestor node_modules entry: ${nodeModules}`);
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) {
      return;
    }
    ancestor = parent;
  }
}
