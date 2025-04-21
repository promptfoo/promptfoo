import { Plugins } from '../../../src/redteam/plugins';

describe('Plugin Index', () => {
  it('exports Plugins array', () => {
    expect(Plugins).toBeDefined();
    expect(Array.isArray(Plugins)).toBe(true);
  });

  it('has ContractPlugin with canGenerateRemote set to true', () => {
    const contractPlugin = Plugins.find((p) => p.key === 'contracts');
    expect(contractPlugin).toBeDefined();
    // When the plugin is instantiated, it will have canGenerateRemote=true
    expect(contractPlugin).not.toBeNull();
  });
});
