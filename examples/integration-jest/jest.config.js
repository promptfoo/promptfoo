import { createDefaultEsmPreset } from 'ts-jest';

export default {
  ...createDefaultEsmPreset({
    tsconfig: {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'node',
      esModuleInterop: true,
    },
  }),
  testEnvironment: 'node',
};
