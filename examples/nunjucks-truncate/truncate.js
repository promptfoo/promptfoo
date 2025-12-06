module.exports = function truncateChars(input, maxLen = 80) {
  const str = typeof input === 'string' ? input : String(input ?? '');
  const limit = Number.isFinite(Number(maxLen)) && Number(maxLen) > 0 ? Number(maxLen) : 80;

  if (str.length <= limit) {
    return str;
  }

  return `${str.slice(0, limit)}...[truncated]`;
};
