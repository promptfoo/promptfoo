import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ORIGINAL_ENV = { ...process.env };

describe('database WAL mode', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-dbtest-'));
    process.env.PROMPTFOO_CONFIG_DIR = tempDir;
    delete process.env.IS_TESTING;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('enables WAL journal mode', () => {
    // Import after env vars are set
    const { getDb } = require('../src/database');
    const db = getDb();
    const journalMode = db.session.client.pragma('journal_mode', { simple: true });
    expect(journalMode.toLowerCase()).toBe('wal');
  });
});
