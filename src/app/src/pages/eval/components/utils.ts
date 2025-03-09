/**
 * Creates a clean copy of an object by removing empty arrays and objects
 * @param obj The object to clean
 * @returns A new object with empty arrays and objects removed
 */
export const removeEmpty = (obj: any): any => {
  // Create a deep copy to avoid modifying the original
  const copy = JSON.parse(JSON.stringify(obj));

  const clean = (obj: any) => {
    Object.keys(obj).forEach((key) => {
      // Check if value is an array with zero items
      if (Array.isArray(obj[key]) && obj[key].length === 0) {
        delete obj[key];
      }
      // Check if value is an empty object with no properties
      else if (obj[key] && typeof obj[key] === 'object' && Object.keys(obj[key]).length === 0) {
        delete obj[key];
      }
      // Recursively clean nested objects that aren't empty
      else if (obj[key] && typeof obj[key] === 'object') {
        clean(obj[key]);
        // After cleaning nested objects, check if they're now empty
        if (Object.keys(obj[key]).length === 0) {
          delete obj[key];
        }
      }
    });
    return obj;
  };

  return clean(copy);
};
