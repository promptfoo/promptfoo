export const getCategoryAnchor = (category: string): string => {
  return '#' + category.toLowerCase().replace(/ and /g, '-').replace(/ /g, '-');
};
