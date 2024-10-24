module.exports = (output, context) => {
  const relevantList = context.vars.lists[context.config.listName];
  if (!relevantList) {
    throw new Error(`No list named ${context.config.listName} found`);
  }
  return relevantList.includes(output);
}