import { ellipsize } from '../../src/utils/text';

describe('ellipsize', () => {
  it('should not modify string shorter than maxLen', () => {
    const str = 'hello';
    expect(ellipsize(str, 10)).toBe('hello');
  });

  it('should truncate string and add ellipsis when longer than maxLen', () => {
    const str = 'hello world';
    expect(ellipsize(str, 8)).toBe('hello...');
  });

  it('should handle string equal to maxLen', () => {
    const str = 'hello';
    expect(ellipsize(str, 5)).toBe('hello');
  });

  it('should handle very short maxLen', () => {
    const str = 'hello';
    expect(ellipsize(str, 4)).toBe('h...');
  });

  it('should handle empty string', () => {
    expect(ellipsize('', 5)).toBe('');
  });
});
