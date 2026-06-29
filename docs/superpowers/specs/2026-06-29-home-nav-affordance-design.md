# Home Navigation Affordance — Design Spec

**Date:** 2026-06-29
**Status:** Approved
**Workflow note:** Per explicit user instruction, this is a direct implementation on `main` executed by a subagent — the combined worktree/OPSX lifecycle in CLAUDE.md is intentionally overridden for this small presentational change.

## Goal

Add an explicit "Home" navigation affordance in two places:

1. **Desktop header** — an icon-only Home link between the brand wordmark and the "Shop" text link.
2. **Mobile sidebar** — a text "Home" link as the first item in the sheet menu.

The brand mark already links to `/`; these affordances are intentional, explicit redundancy requested by the user.

## Changes

### 1. Desktop header — `app/_components/home/site-header.tsx`

- Import the `Home` icon from `lucide-react` (alongside the existing `Search` import).
- Insert an icon-only Home link directly after `<BrandMark />` and before the `<nav>` element:
  - `href="/"`, `aria-label="Home"`.
  - Hidden on mobile (`hidden md:inline-flex`) — the mobile sidebar covers small screens.
  - Styling consistent with existing nav affordances: `text-muted-foreground` with `hover:text-brand` and the existing `duration-(--duration-fast)` transition.
  - Icon sized `h-5 w-5`.

### 2. Mobile sidebar — `app/_components/header/mobile-nav.tsx`

- Add `{ href: "/", label: "Home" }` as the **first** entry in this file's `NAV_LINKS` array.
- Renders as a plain text link identical to the other items; closes the sheet on click via the existing `onClick={() => setOpen(false)}` wiring.

## Non-goals / decisions

- **No shared NAV_LINKS module.** The desktop and mobile arrays already live separately and legitimately differ (desktop nav excludes Home as text since it uses the icon; mobile includes it as text). Introducing a shared constant for a short list is not warranted.
- **No change to `brand-mark.tsx`.**
- **No new tests.** These are static, presentational link markup with no existing unit coverage. Verification is via `npm run build` and `npm run test` (no regressions).

## Verification

- `npm run build` succeeds.
- `npm run test` passes (no regressions).
- Manual check: desktop shows a house icon between the logo and "Shop"; mobile sheet lists "Home" first.
