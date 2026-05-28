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

### 5. Create the Default Admin

The admin dashboard at `/admin` is gated to users with `role = "ADMIN"`. Bootstrap the default admin with:

```bash
npm run admin:create -- --email "dressingbear@gmail.com" --password "1996@Abc" --name "Dressing Bear"
```

**Default admin credentials (sign in at [http://localhost:3000/login](http://localhost:3000/login)):**

| Field | Value |
|-------|-------|
| Email | `dressingbear@gmail.com` |
| Password | `1996@Abc` |
| Name | `Dressing Bear` |

After signing in, you'll land on `/admin` — the dashboard shows live KPI tiles (pending dispatch, today's orders, pending COD, low-stock products).

To promote an existing customer instead of creating a new account, add `--promote` to the command (password is unchanged on promotion).

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
| `npm run admin:create` | Create or promote an admin user (see Getting Started §5) |
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