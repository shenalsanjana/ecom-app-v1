# Design: Initials Avatar + Wishlist in Customer Profile Dropdown

**Date:** 2026-06-26
**Status:** Approved (design)
**Author:** Brainstorming session

## Problem / Goal

The header's account control ([`app/_components/header/profile-menu.tsx`](../../../app/_components/header/profile-menu.tsx))
is already a dropdown, but its trigger is a generic `User` icon and the menu is
missing a customer-facing destination that exists in the app. We want a more
personal, slightly richer customer navigation hub in the header:

1. Replace the generic trigger with an **initials avatar** when a customer is
   signed in (colored circle with their initials), falling back to the current
   `User` icon when signed out.
2. Add a **Wishlist** link to the signed-in dropdown (`/wishlist` page already
   exists but is only reachable via the heart icon today).

This is intentionally small and scoped — no avatar image upload, no schema
changes, no mobile-nav changes.

## Non-Goals (explicitly out of scope)

- Profile **image upload** or any `image` field on the user model / session.
- Displaying `session.user.image` (not populated; would be dead code).
- Mobile nav ([`mobile-nav.tsx`](../../../app/_components/header/mobile-nav.tsx)) changes.
- Adding Security/Password or a name+email header to the dropdown.
- Any auth, DB, or session-shape changes.

## Current State (for reference)

- `ProfileMenu` is a client component using `useSession()` from `next-auth/react`.
  - Signed in: shows "Hi, {firstName}" label, then **My account**, **My orders**,
    **Saved addresses**, optional **Admin panel** (role === "ADMIN"), **Log out**.
  - Signed out: **Log in**, **Sign up**.
- Session user fields available: `name`, `email`, `role`, `id`. No `image`.
- UI stack: shadcn/ui on Base UI (`base-nova` style), Tailwind 4, lucide-react.
  `DropdownMenu` primitive already exists at `components/ui/dropdown-menu.tsx`.
  No `Avatar` component exists yet.
- Existing helper `firstName()` lives in [`app/_lib/format.ts`](../../../app/_lib/format.ts).
- Customer routes that exist: `/account`, `/account/orders`, `/account/addresses`,
  `/account/security`, `/wishlist`, `/cart`.

## Approach

**Chosen: Option A — add a small reusable `Avatar` UI primitive.**

Rationale: keeps `ProfileMenu` clean, gives the rest of the app (e.g. admin
customer/order lists) a reusable avatar, and stays within the initials-only
scope. Alternatives considered: inline the initials directly in `ProfileMenu`
(rejected — not reusable, clutters the component); full shadcn Avatar with an
image slot now (rejected — `image` is never set, so the slot would be dead code).

## Components & Changes

### 1. New UI primitive — `components/ui/avatar.tsx`

A small, presentational `Avatar` component following the existing shadcn/Base UI
pattern used by sibling components in `components/ui/`.

- Renders a circular element containing the user's **initials** on a
  **deterministic background color**.
- Props:
  - `name: string` — used to derive initials and color.
  - `size?` — optional size variant (default matches the current `icon-lg`
    trigger footprint, ~`h-8 w-8` / `size-8`); a small set of sizes is enough.
  - `className?` — standard passthrough/merge via the repo's `cn()` util.
- No image slot. No auth knowledge — pure/presentational so it is unit-testable
  and reusable.
- Accessible: decorative text inside; the accessible name is supplied by the
  trigger `Button`'s existing `aria-label`, so the avatar's initials are marked
  `aria-hidden` to avoid double announcement.

### 2. New helpers in `app/_lib/format.ts`

Placed next to the existing `firstName()`:

- `initials(name: string): string`
  - `"Jane Doe"` → `"JD"` (first + last token initial).
  - Single token `"Jane"` → `"J"`.
  - Empty/whitespace → `""`.
  - Uppercased; trims and collapses whitespace like `firstName` does.
- `avatarColor(seed: string): string`
  - Deterministic hash of `seed` (the name/email) → one entry from a small
    fixed palette of Tailwind background+foreground classes (brand-friendly).
  - Same seed always yields the same color (stable per customer).

### 3. `ProfileMenu` changes — `app/_components/header/profile-menu.tsx`

- **Trigger:**
  - Signed in: render `<Avatar name={user.name || user.email} />` inside the
    existing ghost `Button` (`variant="ghost" size="icon-lg"`).
  - Signed out / loading: keep the existing `<User className="h-5 w-5" />` icon.
  - `aria-label` unchanged: `Signed in as {name}` / `Account`.
- **Dropdown items (signed in):** insert a **Wishlist** item linking to
  `/wishlist`, after "Saved addresses". Resulting order:
  My account → My orders → Saved addresses → **Wishlist** → [Admin panel] → Log out.
- **Signed-out menu:** unchanged.

## Data Flow

No new data source. The avatar derives entirely from `session.user.name` /
`session.user.email`, already read in `ProfileMenu` via `useSession()`. No DB,
schema, session-callback, or API changes.

## Edge Cases

- `name` empty but `email` present → derive initials from the email local-part
  (or its first letter).
- Both empty while authenticated (shouldn't occur) → fall back to `User` icon.
- Loading / unauthenticated → `User` icon, exactly as today.
- Very long names → initials limited to 2 characters; no overflow.

## Testing

- **Unit (Vitest):** `initials()` and `avatarColor()` — multi-word, single-word,
  empty, and determinism (same input → same output).
- **Component (Vitest + Testing Library):** `ProfileMenu`
  - renders initials avatar when authenticated,
  - renders the `User` icon when unauthenticated,
  - the Wishlist link is present with `href="/wishlist"`.
- **Build/lint:** `npm run build` and `npm run test` per repo standard.

## Affected Files (summary)

| File | Change |
| --- | --- |
| `components/ui/avatar.tsx` | **New** — initials avatar primitive |
| `app/_lib/format.ts` | **Add** `initials()` and `avatarColor()` helpers |
| `app/_components/header/profile-menu.tsx` | Use `Avatar` as signed-in trigger; add Wishlist item |
| `app/_lib/__tests__` (or co-located) | **New** unit + component tests |
