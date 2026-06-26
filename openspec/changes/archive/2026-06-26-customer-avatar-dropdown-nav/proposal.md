## Why

The header account control is a dropdown today, but its trigger is a generic
`User` icon and the menu omits a customer destination that already exists in the
app (Wishlist). A personalized initials avatar plus a more complete menu makes
the signed-in customer's account hub clearer and faster to navigate.

## What Changes

- Replace the profile-menu trigger's static `User` icon with an **initials
  avatar** (colored circle showing the customer's initials) when signed in.
- Keep the `User` icon as the fallback when signed out (or when no name/email is
  available).
- Add a **Wishlist** link (`/wishlist`) to the signed-in dropdown, after "Saved
  addresses".
- Introduce a small reusable `Avatar` UI primitive and two pure helpers
  (`initials`, `avatarColor`) for deriving the avatar from a name.

Out of scope (not changing): profile image upload, any `image` field on the user
model/session, the mobile nav, and any Security/email-header additions to the
menu. No DB, schema, session, or auth changes.

## Capabilities

### New Capabilities
- `customer-account-menu`: The header profile/account dropdown for storefront
  customers — its trigger appearance (initials avatar vs. fallback icon) and the
  set of navigation destinations it exposes to signed-in and signed-out users.

### Modified Capabilities
<!-- None — no existing spec defines the header account menu's behavior. -->

## Impact

- **New:** `components/ui/avatar.tsx` (presentational initials avatar primitive).
- **Modified:** `app/_lib/format.ts` (add `initials` and `avatarColor` helpers).
- **Modified:** `app/_components/header/profile-menu.tsx` (avatar trigger + Wishlist item).
- **Tests:** `app/_lib/__tests__/avatar-format.test.ts` (new unit tests).
- No dependencies added; no API, DB, schema, or auth surface affected.
- Source design/plan: `docs/superpowers/specs/2026-06-26-customer-avatar-dropdown-nav-design.md`,
  `docs/superpowers/plans/2026-06-26-customer-avatar-dropdown-nav.md`.
