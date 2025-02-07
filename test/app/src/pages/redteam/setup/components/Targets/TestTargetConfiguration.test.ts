const mockCreateTheme = jest.fn();
jest.mock('@mui/material/styles', () => ({
  useTheme: () => ({
    palette: {
      mode: 'light',
    },
  }),
  createTheme: mockCreateTheme,
}));

describe('TestTargetConfiguration', () => {
  const mockHandleTestTarget = jest.fn();

  const _defaultProps = {
    testingTarget: false,
    handleTestTarget: mockHandleTestTarget,
    selectedTarget: {
      config: {},
    } as any,
    testResult: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('placeholder test', () => {
    expect(true).toBe(true);
  });
});
