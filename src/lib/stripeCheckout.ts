import { loadStripe } from '@stripe/stripe-js';

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

/** Preloads Stripe.js (uses your publishable key). Safe to call once; redirect Checkout still needs the backend session. */
export const stripePromise = publishableKey?.trim()
  ? loadStripe(publishableKey.trim())
  : null;

export type CheckoutPlan = 'monthly' | 'annual';

/**
 * Creates a Stripe Checkout session via the local API (dev proxy) or a deployed checkout URL.
 */
export async function redirectToStripeCheckout(plan: CheckoutPlan = 'monthly'): Promise<void> {
  const apiBase = (import.meta.env.VITE_STRIPE_CHECKOUT_API as string | undefined)?.replace(/\/$/, '');
  const path = '/api/stripe/create-checkout-session';
  const url = apiBase ? `${apiBase}/create-checkout-session` : path;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan }),
  });

  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Checkout failed (${res.status})`);
  }
  if (!data.url) {
    throw new Error('No checkout URL returned');
  }
  window.location.assign(data.url);
}
