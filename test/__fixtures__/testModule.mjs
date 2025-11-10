// ESM test module
export const testFunction = () => 'esm test result';
export const namedExport = 'esm named export';

export default {
  testFunction: () => 'esm default test result',
  defaultProp: 'esm default property',
};
