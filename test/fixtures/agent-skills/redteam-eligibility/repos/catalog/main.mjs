export function searchCatalog(request, catalog) {
  return catalog.filter((product) => product.name.includes(request.query.text));
}
