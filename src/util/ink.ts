type DynamicImportFn = (specifier: string) => Promise<any>;

const { dynamicImport } = require('../dynamic-import.cjs') as {
  dynamicImport: DynamicImportFn;
};

type InkModule = typeof import('ink');

let inkModulePromise: Promise<InkModule> | null = null;

async function loadInkModule(): Promise<InkModule> {
  if (!inkModulePromise) {
    inkModulePromise = dynamicImport('ink') as Promise<InkModule>;
  }

  try {
    return await inkModulePromise;
  } catch (error) {
    inkModulePromise = null;
    const message =
      'Failed to load the `ink` module. Ensure that the `ink` and `react` dependencies are installed.';
    const originalMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nOriginal error: ${originalMessage}`);
  }
}

export async function renderInk(element: unknown, options?: Parameters<InkModule['render']>[1]) {
  const ink = await loadInkModule();
  return ink.render(element as Parameters<InkModule['render']>[0], options);
}

export type InkExports = InkModule;

export async function getInk(): Promise<InkModule> {
  return loadInkModule();
}
