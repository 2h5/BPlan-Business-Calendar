/**
 * Approved public Stripe sandbox fixture. This module intentionally exposes no
 * input path for card data from environment variables or command arguments.
 */
export const STRIPE_SANDBOX_PAYMENT_FIXTURE = {
  cardNumber: '4242424242424242',
  expiry: '1234',
  cvc: '123',
  postalCode: '10001',
  name: 'BPlan Sandbox',
} as const;
