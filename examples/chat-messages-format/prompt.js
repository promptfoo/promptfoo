module.exports = async function ({ vars }) {
  return `Let me show you how ${vars.topic} works in ${vars.language} code:
  
\`\`\`${vars.language.toLowerCase()}
// Example code demonstrating ${vars.topic}
${
  vars.language === 'Python'
    ? `def example_function():
    # ${vars.concept3}
    print("This demonstrates ${vars.topic}")`
    : `function exampleFunction() {
    // ${vars.concept3}
    console.log("This demonstrates ${vars.topic}");
  }`
}
\`\`\``;
};
