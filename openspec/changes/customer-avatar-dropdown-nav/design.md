## Context

The header account control ([`app/_components/header/profile-menu.tsx`](../../../app/_components/header/profile-menu.tsx))
is a client component using NextAuth v5 `useSession()`. Its trigger is a static
`User` icon and its signed-in menu links to My account, My orders, Saved
addresses, optional Admin panel, and Log out. The session exposes `name`,
`email`, `role`, `id` — there is **no** `image` field. The UI stack is
shadcn/ui on Base UI (`base-nova`), Tailwind 4, `class-variance-authority`,
lucide-react; `cn` lives at `@/lib/utils`. No `Avatar` component exists yet.

Full design rationale and the implementation plan live at
`docs/superpowers/specs/2026-06-26-customer-avatar-dropdown-nav-design.md` and
`docs/superpowers/plans/2026-06-26-customer-avatar-dropdown-nav.md`.

## Goals / Non-Goals

**Goals:**
- Show a personalized initials avatar as the signed-in trigger; keep the `User`
  icon as the signed-out / no-identity fallback.
- Derive initials and a stable color purely from the customer's name/email.
- Add a Wishlist destination to the signed-in dropdown.
- Provide a small reusable `Avatar` primitive for use elsewhere later.

**Non-Goals:**
- Profile image upload or any `image` field on the user model/session.
- Rendering `session.user.image` (not populated — would be dead code).
- Mobile-nav changes; Security/Password or name+email-header menu additions.
- Any DB, schema, session-callback, or auth changes.

## Decisions

- **Reusable `Avatar` primitive over inline markup.** Add
  `components/ui/avatar.tsx` rather than inlining initials in `ProfileMenu`.
  *Why:* keeps `ProfileMenu` focused, makes the avatar reusable (e.g. admin
  customer/order lists), and isolates the pure-render logic. *Alternative:*
  inline in `ProfileMenu` — rejected as non-reusable and cluttering.

- **Initials-only avatar; no image slot.** *Why:* the session has no `image`
  field, so an `AvatarImage` slot would always be empty. *Alternative:* full
  shadcn Avatar with image slot now — rejected as dead code for this scope.

- **Pure helpers in `app/_lib/format.ts`.** `initials(name)` and
  `avatarColor(seed)` sit next to the existing `firstName`. *Why:* the repo's
  testing convention extracts pure logic into `.ts` and unit-tests it (see
  `admin-sidebar.test.ts`), since Vitest here runs node-only with no jsdom.
  This keeps the new logic fully TDD-covered while the `.tsx` is verified via
  build + lint + manual smoke.

- **Deterministic color via hash of name into a fixed palette.** *Why:* stable
  per customer and dependency-free. *Alternative:* random color — rejected as
  non-deterministic.

- **Fallback handled in `ProfileMenu`, not `Avatar`.** `ProfileMenu` renders
  `Avatar` only when `user && (user.name || user.email)`, else the `User` icon.
  *Why:* keeps `Avatar` purely presentational and concentrates auth-state
  branching where the session is already read.

## Risks / Trade-offs

- **Tailwind palette classes must be statically present so JIT emits them.** →
  Mitigation: write full class strings (`"bg-rose-500 text-white"`) as literals
  in the palette array — no dynamic class construction.
- **Initials from an email can be unhelpful (single letter).** → Acceptable for
  this scope; authenticated customers normally have a name. Documented as an
  edge case, not a blocker.
- **No automated render test for the `.tsx` changes** (harness limitation). →
  Mitigation: helpers are unit-tested; `ProfileMenu`/`Avatar` verified by
  `npm run build`, `npm run lint`, and a manual smoke check across signed-out /
  customer / admin states.

## Migration Plan

Pure additive UI change. Deploy with a normal build; no data migration. Rollback
is reverting the three edited/added files — no persisted state is affected.
