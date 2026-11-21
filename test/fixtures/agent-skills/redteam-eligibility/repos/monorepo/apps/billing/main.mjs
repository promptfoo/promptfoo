export function invoiceTotal(invoice) {
  return invoice.items.reduce((total, item) => total + item.quantity * item.price, 0);
}
