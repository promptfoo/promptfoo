// Force an ESM failure that triggers the CJS fallback, then a CJS parse failure.
throw new ReferenceError(`require is not defined in ${import.meta.url}`);
