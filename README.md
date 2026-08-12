# Dressing Bear - E-Commerce Store

A modern e-commerce platform for oversize t-shirts built with Next.js 16.

## Brand Information

- **Brand Name:** Dressing Bear
- **Contact:** +94 740545536
- **Email:** dressingbear@gmail.com

## Features

- **Product Catalog:** Oversize t-shirts with size variants (S, M, L, XL)
- **Shopping Cart:** Client-side cart with localStorage persistence
- **User Authentication:** Sign up, login, password reset
- **Wishlist:** Save products for later
- **Checkout:** Multiple payment options
- **Order Management:** Orders sent to RoyalExpress delivery service

## Payment Methods

- Cash on Delivery (COD)
- PayHere
- Koko
- MintPay

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` with your SMTP settings for email notifications:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dressingbear?schema=public"
AUTH_SECRET="your-secret-key"
AUTH_URL="http://localhost:3000"
APP_URL="http://localhost:3000"

# Meta / Facebook (optional — when unset, Pixel + tracking are fully disabled)
NEXT_PUBLIC_META_PIXEL_ID=""

# SMTP Configuration (for order emails)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
SMTP_FROM="Dressing Bear <no-reply@example.com>"

# Brand Info
BRAND_NAME="Dressing Bear"
BRAND_EMAIL="dressingbear@gmail.com"
CONTACT_NUMBER="+94 740545536"
```

### 3. Database Setup

Use a local PostgreSQL instance or a hosted dev branch (Neon / Vercel Postgres). The PowerShell `$env:DATABASE_URL=...;` prefix is correct for Windows.

```bash
# Push schema to database
$env:DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dressingbear?schema=public"; npm run db:push

# Seed demo data
$env:DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dressingbear?schema=public"; npm run db:seed

# Reset database (full reset)
$env:DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dressingbear?schema=public"; npm run db:reset
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Default Admin

The admin dashboard at `/admin` is gated to users with `role = "ADMIN"`. A default admin is created automatically — both on deploy (see [DEPLOY_OVH.md](./DEPLOY_OVH.md)) and locally via a single command.

**Default credentials (sign in at [http://localhost:3000/login](http://localhost:3000/login) or your production URL):**

| Field | Value |
|-------|-------|
| Email | `dressingbear@gmail.com` |
| Password | `1996@Abc` |
| Name | `Dressing Bear` |

After signing in you land on `/admin` — the dashboard shows live KPI tiles (pending dispatch, today's orders, pending COD, low-stock products).

#### Auto-creation on deploy

`scripts/deploy.sh` (and `make admin-ensure`) run `tsx scripts/ensure-admin.ts` via the `migrator` Docker Compose service. The script:

- creates the default admin if missing → logs `Sample admin created`
- skips if it already exists → logs `Admin already exists`
- warns (without auto-promoting) if the email is registered as a regular customer
- soft-fails on any error — the admin can still be created manually with `npm run admin:create`

It uses bcrypt for password hashing (cost 10) and is fully idempotent — safe to run on every deploy.

To override the defaults per environment (recommended for production), set these in `.env` on the VPS:

| Env var | Default |
|---------|---------|
| `SAMPLE_ADMIN_EMAIL` | `dressingbear@gmail.com` |
| `SAMPLE_ADMIN_PASSWORD` | `1996@Abc` |
| `SAMPLE_ADMIN_NAME` | `Dressing Bear` |

#### Manual (local or one-off)

Run the same script against any DB:

```bash
npm run admin:ensure
```

Or create / promote a specific user with explicit args:

```bash
npm run admin:create -- --email "you@example.com" --password "<strong-pw>" --name "Your Name" [--promote]
```

`--promote` flips an existing CUSTOMER to ADMIN without changing their password — use this when you want to grant admin to someone who already signed up.

## Product Categories

- Oversize T-Shirts
- Graphic Tees
- Solid Basics

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Reset database |
| `npm run admin:create` | Create or promote a specific admin user (see Getting Started §5) |
| `npm run admin:ensure` | Idempotent default-admin bootstrap (auto-runs via `scripts/deploy.sh` / `make admin-ensure`) |
| `npm test` | Run unit tests (vitest) |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |

## Demo Data

The seed creates 12 realistic oversize t-shirt products with:
- 3 categories
- 48 product images
- 93 reviews
- Size variants (S, M, L, XL)

## Shipping

- **Standard Shipping:** 350 LKR flat rate

## Order Flow

1. Customer adds items to cart
2. Selects size and quantity
3. Chooses payment method
4. Enters shipping address
5. Places order
6. Order details sent to brand email
7. Order submitted to RoyalExpress for delivery

## Social Commerce / Meta Integration

- **Meta Pixel** is optional. Set `NEXT_PUBLIC_META_PIXEL_ID` to your Pixel ID to
  enable browser tracking of `PageView`, `ViewContent`, `AddToCart`,
  `InitiateCheckout`, and `Purchase`. When the variable is unset or empty, no
  Pixel script loads and the site behaves exactly as before.
- **Catalog feed** for Meta Commerce Manager / Facebook Shop is served at
  `/feed/meta-catalog.csv`. Point a scheduled feed at
  `<APP_URL>/feed/meta-catalog.csv`. It excludes archived products and uses LKR
  prices; on-sale products map `price` → original and `sale_price` → current per
  Meta's convention.
- **Shared links** show the product image, title with price (`Name — LKR 1,990`),
  and description via Open Graph tags, plus `Product` JSON-LD for Google/Pinterest.
- `APP_URL` must be set to the public site origin in production so feed links,
  share URLs, and OG image URLs are absolute.

## SMS / Notify.lk Integration

Phone signup and password reset send one-time codes via
[Notify.lk](https://app.notify.lk). Configure three env vars:
`NOTIFY_LK_USER_ID`, `NOTIFY_LK_API_KEY`, `NOTIFY_LK_SENDER_ID`.

- **Get credentials** from the Notify.lk dashboard → **API Keys**.
- **Sender ID must be approved** before it can send in production — use the
  shared `NotifyDEMO` sender for testing while your own sender ID is pending
  approval.
- **SMS is pre-paid credits**, not free — top up the Notify.lk account or OTP
  delivery will fail.
- In production, set all three vars in `.env` on the VPS (do not commit
  real values to any file).
- If a key was ever shared outside a secrets manager (e.g. pasted during a
  design discussion), regenerate it in the dashboard before using it.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL (via Prisma ORM)
- **Auth:** NextAuth.js v5
- **Styling:** Tailwind CSS + shadcn/ui
- **Email:** Nodemailer
- **Delivery:** RoyalExpress API
- **Hosting:** Docker Compose (app + PostgreSQL + Nginx) on an OVHcloud VPS — see [DEPLOY_OVH.md](./DEPLOY_OVH.md)

## Deployment & Migrations

Production runs on a self-hosted Docker Compose stack (app + PostgreSQL +
Nginx) on an OVHcloud VPS — see **[DEPLOY_OVH.md](./DEPLOY_OVH.md)** for the
full setup and deployment procedure.

- **Deploys** run through GitHub Actions on push to `main`, gated on Vitest
  and a required-reviewer approval — see `.github/workflows/deploy.yml` and
  [DEPLOY_OVH.md](./DEPLOY_OVH.md) §4.1. `./scripts/deploy.sh` on the VPS
  remains the manual fallback.
- **Migrations** run via `docker compose --profile tools run --rm migrator
  npx prisma migrate deploy` (or `make migrate`), as an explicit step in
  `scripts/deploy.sh` before the app image is rebuilt — never automatically
  as part of the app's own build or startup.
- **Seeding** is deliberate: `make seed` (or `npm run db:seed` locally
  against a dev database).
- **Admin user** is ensured via `make admin-ensure`, or manually with
  `npm run admin:create`.