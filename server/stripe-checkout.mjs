import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import Stripe from 'stripe';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = Number(process.env.STRIPE_API_PORT || 4242);
const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
const stripe = stripeSecret ? new Stripe(stripeSecret) : null;

if (!stripeSecret) {
  console.warn(
    '[stripe-checkout] STRIPE_SECRET_KEY is missing in .env.local. Add your Stripe secret key (sk_test_...) so Checkout can run.'
  );
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) {
    return res.status(503).json({
      error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local (Dashboard → Developers → API keys).',
    });
  }

  try {
    const plan = req.body?.plan === 'annual' ? 'annual' : 'monthly';
    const unitAmount = plan === 'annual' ? 24900 : 2900;
    const name =
      plan === 'annual'
        ? 'AI Career Assistant — Pro (Annual)'
        : 'AI Career Assistant — Pro (Monthly)';

    const originHeader = req.get('origin');
    const referer = req.get('referer');
    const origin =
      originHeader ||
      (referer ? new URL(referer).origin : null) ||
      'http://localhost:5173';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: unitAmount,
            product_data: { name },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?upgrade=cancel`,
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Checkout failed' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, checkoutReady: Boolean(stripe) });
});

app.listen(PORT, () => {
  console.log(`Stripe checkout API: http://localhost:${PORT}`);
});
