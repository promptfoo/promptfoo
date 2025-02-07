describe('HttpAdvancedConfiguration', () => {
  const mockUpdateCustomTarget = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles request transform changes', () => {
    mockUpdateCustomTarget('transformRequest', 'test transform');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('transformRequest', 'test transform');
  });

  it('handles response transform changes', () => {
    mockUpdateCustomTarget('transformResponse', 'test transform');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('transformResponse', 'test transform');
  });

  it('handles session source changes', () => {
    mockUpdateCustomTarget('sessionSource', 'client');
    mockUpdateCustomTarget('sessionParser', undefined);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('sessionSource', 'client');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('sessionParser', undefined);
  });

  it('handles session parser changes', () => {
    mockUpdateCustomTarget('sessionParser', 'test parser');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('sessionParser', 'test parser');
  });

  it('handles HTTP status code validation changes', () => {
    mockUpdateCustomTarget('validateStatus', 'status >= 200 && status < 300');
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith(
      'validateStatus',
      'status >= 200 && status < 300',
    );
  });
});
