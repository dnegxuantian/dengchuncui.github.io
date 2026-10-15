export function shippingFee(subtotal) {
  return subtotal > 100 ? 0 : 8;
}
