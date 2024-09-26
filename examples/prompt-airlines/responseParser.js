module.exports = (json, text) => {
  console.error('json', json);
  console.error('text', text);
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json);
    } catch (error) {
      console.error('Failed to parse JSON:', error);
    }
  }

  // Function to strip HTML tags
  const stripHtmlTags = (str) => str.replace(/<[^>]*>/g, '');

  // Strip HTML tags from json.content and return the result
  const result = stripHtmlTags(json.content || '');
  console.error('result', result);
  return result;
};
