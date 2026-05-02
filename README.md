# ✨ AI Career Assistant

**AI-powered career companion** — resume analysis with Gemini, mock interviews with AI feedback, goals & scheduling tools, and Stripe Checkout for **Pro** upgrades.

Original UI bundle inspired by [this Figma design](https://www.figma.com/design/ie2GZEtrhFaondq8B50oUn/Update-design-and-functionality).

---

## 🎯 What you get

| Area | Description |
|------|-------------|
| 📊 **Dashboard** | Career readiness snapshot, resume workflow, tips |
| 🎯 **Career Goals** | Track objectives, progress, deadlines |
| 📄 **Resume Builder / Analyzer** | Upload **`.txt`** or **paste** text → Gemini scores & insights |
| 💬 **Interview Prep** | Gemini-generated questions + **answer scoring & feedback** |
| 👥 **Networking** | Placeholder for future tools |
| ⚙️ **Settings** | Preferences shell |
| 👑 **Pro / Billing** | Stripe-hosted Checkout ($29 monthly flow in demo server) |

---

## 🔄 How the whole project works

### 🖼️ Frontend (React + Vite)

1. **`npm run dev`** starts **two processes**: the **Vite** dev server (`5173`) and a tiny **Stripe Checkout API** (`4242`).
2. The React app (`src/app/App.tsx`) is a **single-page dashboard** with sidebar tabs. State lives in React hooks (goals, interviews, notifications, etc.).
3. **Gemini** is called **from the browser** via REST (`src/lib/gemini.ts`). Your **`VITE_GEMINI_API_KEY`** must be set locally — never commit real keys.

### 🤖 AI flows (Gemini)

```text
Resume analyze     →  User provides text  →  gemini.ts  →  JSON (score, strengths, tips…)
Interview start    →  gemini.ts generates 5 questions
Submit answer      →  gemini.ts returns feedback + score (with heuristic fallback)
```

Models are tried in order until one succeeds (`gemini-2.5-flash`, then fallbacks — see `src/lib/gemini.ts`).

### 💳 Payments (Stripe)

```text
User clicks “Upgrade Now”
       →  POST /api/stripe/create-checkout-session  (proxied to localhost:4242)
       →  Server creates Stripe Checkout Session (needs STRIPE_SECRET_KEY)
       →  Browser redirects to Stripe’s hosted checkout
       →  Return URLs: ?upgrade=success | ?upgrade=cancel
```

- **`pk_...`** → optional preload via `@stripe/stripe-js` (`src/lib/stripeCheckout.ts`).
- **`sk_...`** → **server only** in `.env.local`, read by `server/stripe-checkout.mjs`.

---

## 🛠️ Tech stack

- ⚛️ **React 18** + **TypeScript**
- ⚡ **Vite 6**
- 🎨 **Tailwind CSS 4**
- 🧩 **Radix / shadcn-style UI** primitives
- 🤖 **Google Gemini API** (Generative Language REST)
- 💰 **Stripe Checkout** + **Express** mini-API

---

## 📦 Getting started

### Prerequisites

- **Node.js** 18+ (20+ recommended)
- **npm**
- Accounts / keys (local only):
  - [Google AI Studio](https://aistudio.google.com/apikey) — Gemini API key  
  - [Stripe Dashboard](https://dashboard.stripe.com/apikeys) — publishable + **secret** test keys  

### Install

```bash
npm install
```

### Configure environment

Copy the example file and fill in your values:

```bash
# macOS / Linux
cp .env.example .env.local

# Windows PowerShell
Copy-Item .env.example .env.local
```

| Variable | Where it runs | Purpose |
|----------|----------------|--------|
| `VITE_GEMINI_API_KEY` | Browser (bundled) | Gemini resume + interview calls |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Browser | Stripe.js / future Elements |
| `STRIPE_SECRET_KEY` | **Server only** | Create Checkout sessions |
| `VITE_STRIPE_CHECKOUT_API` | Browser (optional) | Production API base URL if not using Vite proxy |

> 🔒 **Never commit `.env.local`.** It is gitignored. Only `.env.example` (empty placeholders) belongs in Git.

---

## 🖥️ Scripts

| Command | What it does |
|---------|----------------|
| `npm run dev` | 🚀 Vite **+** Stripe API (via `concurrently`) |
| `npm run dev:web` | Vite only |
| `npm run dev:api` | Stripe checkout server only (`4242`) |
| `npm run build` | Production build → `dist/` |

After **Upgrade** / payment, the app reads `?upgrade=success` or `?upgrade=cancel` and shows a toast.

---

## 📂 Project layout (high level)

```text
├── src/
│   ├── app/App.tsx       # Main UI, tabs, Gemini + Stripe wiring
│   ├── lib/gemini.ts     # Gemini REST client
│   └── lib/stripeCheckout.ts
├── server/
│   └── stripe-checkout.mjs   # Express: create Checkout Session
├── vite.config.ts        # Path alias `@`, Stripe dev proxy
├── .env.example          # Safe template (no secrets)
└── README.md             # You are here 🙂
```

---

## 🔐 Security checklist (before going public)

- Rotate any key that ever appeared in chat, issues, or screenshots.
- Prefer a **backend proxy** for Gemini in production so **API keys are not** in the client bundle.
- Keep **`sk_`** keys only on the server / hosting secret store.
- Enable **GitHub secret scanning** on the repo.

---

## 📜 Attributions

See `ATTRIBUTIONS.md` for third-party notices.

---

<p align="center">
  <strong>Made with 💜 for job seekers leveling up their careers</strong>
</p>
