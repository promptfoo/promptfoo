import { VALID_FILE_EXTENSIONS } from '../../src/prompts/constants';

describe('VALID_FILE_EXTENSIONS', () => {
  it('should include .j2 extension', () => {
    expect(VALID_FILE_EXTENSIONS).toContain('.j2');
  });

  it('should include common file extensions', () => {
    expect(VALID_FILE_EXTENSIONS).toContain('.js');
    expect(VALID_FILE_EXTENSIONS).toContain('.json');
    expect(VALID_FILE_EXTENSIONS).toContain('.md');
    expect(VALID_FILE_EXTENSIONS).toContain('.txt');
    expect(VALID_FILE_EXTENSIONS).toContain('.yaml');
    expect(VALID_FILE_EXTENSIONS).toContain('.yml');
  });
});
