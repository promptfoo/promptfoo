module.exports = function ({ vars }) {
  return [
    { role: 'user', content: `Hello, my name is ${vars.userName || 'Anonymous'}` },
    { role: 'assistant', content: 'Hi! How can I help you today?' },
  ];
};
