// Mock database module for tests that don't need real database
// Tests that need real database should use jest.unmock('../../src/database')

// Re-export actual table definitions
export * from '../database/tables';

// Create chainable mock methods
const createChainableMock = () => {
  const mock: any = {
    insert: jest.fn(),
    values: jest.fn(),
    select: jest.fn(),
    from: jest.fn(),
    where: jest.fn(),
    limit: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    set: jest.fn(),
    orderBy: jest.fn(),
    leftJoin: jest.fn(),
    innerJoin: jest.fn(),
    returning: jest.fn(),
    onConflictDoNothing: jest.fn(),
    onConflictDoUpdate: jest.fn(),
    all: jest.fn(),
    get: jest.fn(),
    run: jest.fn(),
    execute: jest.fn(),
    transaction: jest.fn(),
  };

  // Make all methods return the mock for chaining
  Object.keys(mock).forEach((key) => {
    if (key === 'transaction') {
      // Transaction needs special handling
      mock[key].mockImplementation(async (fn: any) => {
        const tx = createChainableMock();
        return fn(tx);
      });
    } else {
      mock[key].mockReturnThis();
    }
  });

  // Override specific methods that should resolve to values
  mock.limit.mockResolvedValue([]);
  mock.where.mockResolvedValue([]);
  mock.returning.mockResolvedValue([]);
  mock.onConflictDoNothing.mockResolvedValue([]);
  mock.onConflictDoUpdate.mockResolvedValue([]);
  mock.execute.mockResolvedValue({ rows: [] });
  mock.all.mockResolvedValue([]);
  mock.get.mockResolvedValue(undefined);
  mock.run.mockResolvedValue({ changes: 0 });
  
  // Special handling for values - it should resolve when used with insert/update
  mock.values.mockImplementation(() => {
    const valuesMock = Object.create(mock);
    valuesMock.returning = jest.fn().mockResolvedValue([]);
    valuesMock.onConflictDoNothing = jest.fn().mockResolvedValue([]);
    valuesMock.onConflictDoUpdate = jest.fn().mockResolvedValue([]);
    // For direct resolution (no chaining after values)
    valuesMock.then = (resolve: any) => resolve([]);
    return valuesMock;
  });

  // Special handling for set - it should resolve when used with update
  mock.set.mockImplementation(() => {
    const setMock = Object.create(mock);
    setMock.where = jest.fn().mockResolvedValue({ changes: 1 });
    setMock.returning = jest.fn().mockResolvedValue([]);
    return setMock;
  });

  // Special handling for delete - make it resolve
  mock.delete.mockResolvedValue({ changes: 0 });

  return mock;
};

export const mockDbInstance = createChainableMock();

export const getDb = jest.fn(() => mockDbInstance);
export const closeDb = jest.fn();
export const isDbOpen = jest.fn(() => true);
export const getDbPath = jest.fn(() => ':memory:');
export const getDbSignalPath = jest.fn(() => '/tmp/evalLastWritten');