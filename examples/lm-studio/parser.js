module.exports = (json, text) => {
  return json.choices[0].message.content;
};
