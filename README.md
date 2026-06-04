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
- MinitPay

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` with your SMTP settings for email notifications:

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="your-secret-key"
AUTH_URL="http://localhost:3000"
APP_URL="http://localhost:3000"

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

```bash
# Push schema to database
$env:DATABASE_URL="file:./dev.db"; npm run db:push

# Seed demo data
$env:DATABASE_URL="file:./dev.db"; npm run db:seed

# Reset database (full reset)
$env:DATABASE_URL="file:./dev.db"; npm run db:reset
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Default Admin

The admin dashboard at `/admin` is gated to users with `role = "ADMIN"`. A default admin is created automatically — both on Vercel deploys (as part of `vercel build`) and locally via a single command.

**Default credentials (sign in at [http://localhost:3000/login](http://localhost:3000/login) or your production URL):**

| Field | Value |
|-------|-------|
| Email | `dressingbear@gmail.com` |
| Password | `1996@Abc` |
| Name | `Dressing Bear` |

After signing in you land on `/admin` — the dashboard shows live KPI tiles (pending dispatch, today's orders, pending COD, low-stock products).

#### Auto-creation on Vercel deploy

`vercel.json`'s `buildCommand` includes `tsx scripts/ensure-admin.ts`, which runs on every deploy after `prisma migrate deploy`. The script:

- creates the default admin if missing → logs `Sample admin created`
- skips if it already exists → logs `Admin already exists`
- warns (without auto-promoting) if the email is registered as a regular customer
- soft-fails on any error so the build continues — the admin can still be created manually with `npm run admin:create`

It uses bcrypt for password hashing (cost 10) and is fully idempotent — safe to run on every deploy.

To override the defaults per environment (recommended for production), set these in **Vercel → Settings → Environment Variables**:

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
| `npm run admin:ensure` | Idempotent default-admin bootstrap (auto-runs on Vercel build) |
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

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** SQLite with Prisma ORM
- **Auth:** NextAuth.js v5
- **Styling:** Tailwind CSS + shadcn/ui
- **Email:** Nodemailer
- **Delivery:** RoyalExpress API

## Deployment & Migrations

The Vercel build command is intentionally minimal:

```
prisma generate && next build
```

Database work is **not** part of the build, so a paused or unreachable database
no longer fails a frontend deploy.

- **Migrations** apply automatically via the `.github/workflows/migrate.yml`
  GitHub Action on every push to `main` that touches `prisma/`. It runs
  `prisma migrate deploy` using the `DATABASE_URL` GitHub Actions secret. You
  can also trigger it manually (workflow_dispatch) or run `npm run db:deploy`
  locally against the target database.
- **Seeding** is no longer run on every deploy (Postgres persists the catalog).
  Run it deliberately when you need to (re)load demo/catalog data:
  `npm run db:seed`.
- **Admin user** is ensured manually with `npm run admin:ensure`.

### Required GitHub secret

The migrate workflow needs a repository secret named `DATABASE_URL` containing
the database connection string. Set it under **Settings → Secrets and variables
→ Actions**. Keep this value out of `vercel.json` and any committed file.