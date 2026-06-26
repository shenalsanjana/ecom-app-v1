## 1. Helpers (`initials`, `avatarColor`)

- [x] 1.1 Write failing unit tests in `app/_lib/__tests__/avatar-format.test.ts` covering `initials` (multi-word "Jane Doe"→"JD", "Mary Jane Watson"→"MW", single "Jane"→"J", email "jane@example.com"→"J", whitespace trim/collapse, empty→"") and `avatarColor` (matches `^bg-\S+ text-\S+$`, deterministic for same seed, valid for empty seed)
- [x] 1.2 Run `npm run test -- app/_lib/__tests__/avatar-format.test.ts` and confirm it FAILS (not exported)
- [x] 1.3 Implement `initials(name: string): string` and `avatarColor(seed: string): string` (hash → fixed palette of literal `"bg-… text-…"` class strings) in `app/_lib/format.ts`, appended after `firstName`
- [x] 1.4 Run `npm run test -- app/_lib/__tests__/avatar-format.test.ts` and confirm all assertions PASS
- [x] 1.5 Commit: `feat(format): add initials and avatarColor helpers`

## 2. Avatar UI primitive

- [x] 2.1 Create `components/ui/avatar.tsx` — a presentational `Avatar` exporting `{ name: string; size?: "sm"|"md"|"lg"; className?: string } & React.ComponentProps<"span">`, rendering a circular `aria-hidden` `<span>` with `cva` size variants, `cn(...)`, `avatarColor(name)` background, and `initials(name)` text
- [x] 2.2 Verify it type-checks: `npm run build` (or `npx tsc --noEmit`) succeeds with no errors from the new file
- [x] 2.3 Commit: `feat(ui): add initials Avatar component`

## 3. Wire into ProfileMenu

- [x] 3.1 In `app/_components/header/profile-menu.tsx`, import `Avatar` from `@/components/ui/avatar`
- [x] 3.2 Replace the trigger child: render `<Avatar name={user.name || user.email} size="md" />` when `user && (user.name || user.email)`, else keep `<User className="h-5 w-5" />`
- [x] 3.3 Add a Wishlist `DropdownMenuItem` (`<Link href="/wishlist" />`, label "Wishlist") immediately after the "Saved addresses" item
- [x] 3.4 Run `npm run build` and `npm run lint` — lint passes (exit 0); `next build` reports "✓ Compiled successfully" (tsc + bundling clean). Full prerender/export needs a reachable `DATABASE_URL` (pre-existing env requirement, unrelated to this change).
- [ ] 3.5 Manual smoke check (`npm run dev`): signed-out shows `User` icon + Log in/Sign up; customer shows initials avatar + My account/My orders/Saved addresses/Wishlist/Log out with Wishlist→`/wishlist`; admin also shows Admin panel — DEFERRED: needs running app + DATABASE_URL + customer/admin accounts
- [x] 3.6 Commit: `feat(header): initials avatar trigger and Wishlist link in profile menu`

## 4. Full validation

- [x] 4.1 Run `npm run test` (full suite) and confirm PASS including `avatar-format.test.ts` — 61 files / 442 tests passing
- [x] 4.2 Run `npm run build` and confirm a clean production build — VERIFIED green (exit 0) with a reachable `DATABASE_URL`; full route table generated incl. `/wishlist`
- [x] 4.3 Run `npm run lint` and confirm no new findings — exit 0
