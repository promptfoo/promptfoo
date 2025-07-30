import { Command } from 'commander';
import { modelScanCommand } from '../../src/commands/modelScan';

// Mock the modelScanAction module
jest.mock('../../src/commands/modelScan/modelScanAction', () => ({
  checkModelAuditInstalled: jest.fn().mockResolvedValue(true),
  modelScanAction: jest.fn().mockResolvedValue(undefined),
}));

describe('modelScanCommand', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.exitOverride(); // Prevent process.exit during tests
    jest.clearAllMocks();
  });

  it('should require at least one model path', async () => {
    modelScanCommand(program);

    await expect(program.parseAsync(['node', 'test', 'scan-model'])).rejects.toThrow(
      "error: missing required argument 'modelPaths'"
    );
  });

  it('should accept model paths and call modelScanAction', async () => {
    const { modelScanAction } = require('../../src/commands/modelScan/modelScanAction');
    
    modelScanCommand(program);
    await program.parseAsync(['node', 'test', 'scan-model', 'model1.py', 'model2.py']);

    expect(modelScanAction).toHaveBeenCalledWith(
      ['model1.py', 'model2.py'],
      expect.objectContaining({
        format: 'console',
        timeout: '600',
        maxFileSize: '1000000',
        maxTotalSize: '5000000',
      })
    );
  });

  it('should pass options to modelScanAction', async () => {
    const { modelScanAction } = require('../../src/commands/modelScan/modelScanAction');
    
    modelScanCommand(program);
    await program.parseAsync([
      'node',
      'test',
      'scan-model',
      'model.py',
      '--format',
      'json',
      '--output',
      'results.json',
      '--verbose',
      '--timeout',
      '300',
    ]);

    expect(modelScanAction).toHaveBeenCalledWith(
      ['model.py'],
      expect.objectContaining({
        format: 'json',
        output: 'results.json',
        verbose: true,
        timeout: '300',
      })
    );
  });

  it('should register the command with correct name and description', () => {
    modelScanCommand(program);
    
    const command = program.commands.find((cmd) => cmd.name() === 'scan-model');
    expect(command).toBeDefined();
    expect(command?.description()).toBe('Scan model files for security risks');
  });
});

describe('checkModelAuditInstalled', () => {
  it('should be exported from modelScanAction', () => {
    const { checkModelAuditInstalled } = require('../../src/commands/modelScan/modelScanAction');
    expect(checkModelAuditInstalled).toBeDefined();
    expect(typeof checkModelAuditInstalled).toBe('function');
  });
});