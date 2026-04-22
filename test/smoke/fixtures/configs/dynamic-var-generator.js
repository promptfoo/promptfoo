// Dynamic variable that returns current ISO UTC timestamp
// Used to test that file:// vars are resolved before being passed to assertions
module.exports = function (_varName, _prompt, _vars, _provider) {
  return {
    output: new Date().toISOString(),
  };
};
