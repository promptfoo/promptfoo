export const createRequire = () => {
  return () => {
    throw new Error('require() is not available in browser transforms.');
  };
};

export default {
  createRequire,
};
