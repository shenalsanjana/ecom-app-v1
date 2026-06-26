# Customer Avatar Dropdown + Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the header profile-menu's generic `User` icon with an initials avatar for signed-in customers, and add a Wishlist link to the signed-in dropdown.

**Architecture:** Two pure, unit-tested helpers (`initials`, `avatarColor`) go in `app/_lib/format.ts`. A small presentational `Avatar` primitive in `components/ui/avatar.tsx` consumes them. `ProfileMenu` uses `Avatar` as its signed-in trigger and gains a Wishlist menu item. No DB, schema, session, or auth changes.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Tailwind 4, shadcn/ui on Base UI (`base-nova`), `class-variance-authority`, lucide-react, NextAuth v5 (`useSession`), Vitest.

## Global Constraints

- **Design spec:** `docs/superpowers/specs/2026-06-26-customer-avatar-dropdown-nav-design.md` — implement exactly that scope.
- **Scope is initials-only:** no image upload, no `image` field on user/session, no mobile-nav changes, no Security/email-header additions.
- **`cn` util import path:** `@/lib/utils`.
- **Path alias:** `@` → repo root (per `vitest.config.ts` and `tsconfig`).
- **Test runner reality:** Vitest is configured with `environment: "node"` and only includes `app/**/*.test.ts` / `app/**/__tests__/**/*.test.ts` — **`.tsx` files are NOT run and there is no jsdom/Testing Library**. Therefore: pure logic is TDD-tested as `.ts`; `.tsx` components are verified via `npm run build`, `npm run lint`, and a manual smoke check. (This intentionally adjusts the spec's "component test with Testing Library" item, which the repo's harness does not support.)
- **Validation before merge:** `npm run build` and `npm run test` must pass.
- **Commit style:** Conventional Commits (`feat(...)`, `test(...)`). Small, frequent commits.

---

### Task 1: `initials()` and `avatarColor()` helpers

**Files:**
- Modify: `app/_lib/format.ts` (append after existing `firstName`)
- Test: `app/_lib/__tests__/avatar-format.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `initials(name: string): string` — 0–2 uppercase letters.
  - `avatarColor(seed: string): string` — a Tailwind class string `"bg-… text-…"`, deterministic per `seed`.

- [ ] **Step 1: Write the failing tests**

Create `app/_lib/__tests__/avatar-format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initials, avatarColor } from "../format";

describe("initials", () => {
  it("takes first + last initial for multi-word names", () => {
    expect(initials("Jane Doe")).toBe("JD");
    expect(initials("Mary Jane Watson")).toBe("MW");
  });

  it("takes the first letter for a single-word name", () => {
    expect(initials("Jane")).toBe("J");
  });

  it("derives from an email when that is all we have", () => {
    expect(initials("jane@example.com")).toBe("J");
  });

  it("uppercases and trims/collapses whitespace", () => {
    expect(initials("  jane   doe  ")).toBe("JD");
  });

  it("returns empty string for empty/whitespace input", () => {
    expect(initials("")).toBe("");
    expect(initials("   ")).toBe("");
  });
});

describe("avatarColor", () => {
  it("returns a bg+text class string", () => {
    expect(avatarColor("Jane Doe")).toMatch(/^bg-\S+ text-\S+$/);
  });

  it("is deterministic for the same seed", () => {
    expect(avatarColor("Jane Doe")).toBe(avatarColor("Jane Doe"));
  });

  it("returns a valid class even for empty seed", () => {
    expect(avatarColor("")).toMatch(/^bg-\S+ text-\S+$/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- app/_lib/__tests__/avatar-format.test.ts`
Expected: FAIL — `initials`/`avatarColor` are not exported from `../format`.

- [ ] **Step 3: Implement the helpers**

Append to `app/_lib/format.ts` (after `firstName`):

```ts
export function initials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}

// Small fixed palette; each entry is a Tailwind background + readable foreground.
const AVATAR_COLORS = [
  "bg-rose-500 text-white",
  "bg-orange-500 text-white",
  "bg-amber-500 text-black",
  "bg-emerald-500 text-white",
  "bg-teal-500 text-white",
  "bg-sky-500 text-white",
  "bg-indigo-500 text-white",
  "bg-violet-500 text-white",
] as const;

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- app/_lib/__tests__/avatar-format.test.ts`
Expected: PASS (all 8 assertions).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/format.ts app/_lib/__tests__/avatar-format.test.ts
git commit -m "feat(format): add initials and avatarColor helpers"
```

---

### Task 2: `Avatar` UI primitive

**Files:**
- Create: `components/ui/avatar.tsx`

**Interfaces:**
- Consumes: `initials`, `avatarColor` from `@/app/_lib/format`; `cn` from `@/lib/utils`.
- Produces: `Avatar` (named export) with props
  `{ name: string; size?: "sm" | "md" | "lg"; className?: string } & React.ComponentProps<"span">`.
  Renders a circular `<span>` containing the initials, `aria-hidden` (accessible name is provided by the consuming trigger).

- [ ] **Step 1: Create the component**

Create `components/ui/avatar.tsx`:

```tsx
import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { initials as toInitials, avatarColor } from "@/app/_lib/format";

const avatarVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium leading-none",
  {
    variants: {
      size: {
        sm: "size-6 text-xs",
        md: "size-8 text-sm",
        lg: "size-10 text-base",
      },
    },
    defaultVariants: { size: "md" },
  }
);

type AvatarProps = React.ComponentProps<"span"> &
  VariantProps<typeof avatarVariants> & { name: string };

function Avatar({ name, size, className, ...props }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(avatarVariants({ size }), avatarColor(name), className)}
      {...props}
    >
      {toInitials(name)}
    </span>
  );
}

export { Avatar, avatarVariants };
```

- [ ] **Step 2: Type-check / build the component**

Run: `npm run build`
Expected: build succeeds (no TS errors from the new file). If the full build is slow, a faster gate is `npx tsc --noEmit` — expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/avatar.tsx
git commit -m "feat(ui): add initials Avatar component"
```

---

### Task 3: Wire Avatar + Wishlist into `ProfileMenu`

**Files:**
- Modify: `app/_components/header/profile-menu.tsx`

**Interfaces:**
- Consumes: `Avatar` from `@/components/ui/avatar`.
- Produces: no new exports (component behavior change only).

- [ ] **Step 1: Add the Avatar import**

In `app/_components/header/profile-menu.tsx`, add to the imports (next to the other `@/components/ui` imports):

```tsx
import { Avatar } from "@/components/ui/avatar";
```

- [ ] **Step 2: Use Avatar as the signed-in trigger**

Replace the trigger's child icon. Current:

```tsx
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={user ? `Signed in as ${user.name}` : "Account"}
          />
        }
      >
        <User className="h-5 w-5" />
      </DropdownMenuTrigger>
```

Becomes:

```tsx
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={user ? `Signed in as ${user.name}` : "Account"}
          />
        }
      >
        {user && (user.name || user.email) ? (
          <Avatar name={user.name || user.email} size="md" />
        ) : (
          <User className="h-5 w-5" />
        )}
      </DropdownMenuTrigger>
```

(The `User` import from `lucide-react` stays — it is still the signed-out / fallback icon.)

- [ ] **Step 3: Add the Wishlist menu item**

In the signed-in branch, insert a Wishlist item immediately after the "Saved addresses" item. Current:

```tsx
            <DropdownMenuItem render={<Link href="/account/addresses" />}>
              Saved addresses
            </DropdownMenuItem>
            {user.isAdmin && (
```

Becomes:

```tsx
            <DropdownMenuItem render={<Link href="/account/addresses" />}>
              Saved addresses
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/wishlist" />}>
              Wishlist
            </DropdownMenuItem>
            {user.isAdmin && (
```

- [ ] **Step 4: Verify build + lint**

Run: `npm run build`
Expected: build succeeds.
Run: `npm run lint`
Expected: no new errors in `profile-menu.tsx` or `avatar.tsx`.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, then:
- Signed out → header shows the `User` icon; dropdown shows Log in / Sign up. ✔
- Signed in as a customer → header shows a colored initials circle; dropdown shows My account, My orders, Saved addresses, **Wishlist**, Log out; Wishlist navigates to `/wishlist`. ✔
- Signed in as admin → same plus **Admin panel**. ✔

- [ ] **Step 6: Commit**

```bash
git add app/_components/header/profile-menu.tsx
git commit -m "feat(header): initials avatar trigger and Wishlist link in profile menu"
```

---

### Task 4: Full validation

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS (including the new `avatar-format.test.ts`).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: clean (no new findings).

---

## Self-Review

**Spec coverage:**
- Initials avatar trigger (signed in) + `User` fallback (signed out) → Task 1 (helpers), Task 2 (Avatar), Task 3 Step 2. ✔
- Deterministic color from name → `avatarColor` (Task 1). ✔
- `initials()` / `avatarColor()` in `app/_lib/format.ts` next to `firstName` → Task 1. ✔
- Add Wishlist `/wishlist` after Saved addresses → Task 3 Step 3. ✔
- New `components/ui/avatar.tsx` primitive, presentational, `aria-hidden` → Task 2. ✔
- Edge cases (empty name → email; both empty → User icon; loading/unauth → User icon) → `initials` empty handling + Task 3 Step 2 conditional. ✔
- Testing: unit tests for helpers → Task 1; build/lint/manual for `.tsx` → Tasks 2–4. The spec's Testing-Library component test is intentionally replaced by build + manual smoke because the repo's Vitest harness is node-only with no jsdom (documented in Global Constraints). ✔
- Out-of-scope items (image upload, schema, mobile nav, security/email header) → not touched. ✔

**Placeholder scan:** none — all steps contain concrete code/commands.

**Type consistency:** `initials`/`avatarColor` signatures match between Task 1 (definition) and Task 2 (consumption). `Avatar` prop `name` + `size="md"` used in Task 3 matches the Task 2 definition. `user.name || user.email` is a `string` (both coerced via `?? ""` in the existing component), satisfying `Avatar`'s `name: string`.
