// Dynamic variable that returns current ISO UTC timestamp
// Used to test that file:// vars are resolved before being passed to assertions
module.exports = function (varName, prompt, vars, provider) {
  return {
    output: new Date().toISOString(),
  };
};
