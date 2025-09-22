async function dynamicImport(specifier) {
  return import(specifier);
}

module.exports = {
  dynamicImport,
};
