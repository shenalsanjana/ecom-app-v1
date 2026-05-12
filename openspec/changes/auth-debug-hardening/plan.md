# Auth Debug Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diagnose and fix the NextAuth v5 server configuration error by implementing detailed internal logging and hardening the auth configuration.

**Architecture:** We will add a custom logger to the NextAuth initialization and wrap the `authorize` logic in explicit try/catch blocks with console output. We will also ensure configuration parameters like `secret` and `trustHost` are consistently applied.

**Tech Stack:** Next.js 16 (App Router), NextAuth.js v5, Prisma, PostgreSQL.

---

### Task 1: Initialize Feature Branch

**Files:**
- None

- [ ] **Step 1: Create the feature branch**

```bash
git checkout develop
git checkout -b feat/auth-debug-hardening
```

- [ ] **Step 2: Commit initial empty state**

```bash
git commit --allow-empty -m "chore: start auth debug hardening"
```

### Task 2: Harden Auth Configuration

**Files:**
- Modify: `app/_lib/auth.config.ts`

- [ ] **Step 1: Ensure secret and trustHost are explicitly defined**

```typescript
// app/_lib/auth.config.ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  // ... rest of file
```

- [ ] **Step 2: Commit changes**

```bash
git add app/_lib/auth.config.ts
git commit -m "fix(auth): ensure secret and trustHost are in authConfig"
```

### Task 3: Implement Enhanced Logging and Tracing

**Files:**
- Modify: `app/_lib/auth.ts`

- [ ] **Step 1: Add logger and authorize tracing**

```typescript
// app/_lib/auth.ts
// ... imports
import { LoginSchema } from "@/app/_lib/validation";
import bcrypt from "bcryptjs";

const authSecret = process.env.AUTH_SECRET;
if (!authSecret && process.env.NODE_ENV === "production") {
  console.warn("[Auth]: AUTH_SECRET is not set in production. Login will fail.");
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  secret: authSecret,
  trustHost: true,
  debug: process.env.NODE_ENV === "development",
  logger: {
    error: (code, metadata) => {
      console.error(`[NextAuth Error]: ${code}`, metadata);
    },
    warn: (code) => {
      console.warn(`[NextAuth Warn]: ${code}`);
    },
    debug: (code, metadata) => {
      console.log(`[NextAuth Debug]: ${code}`, metadata);
    },
  },
  providers: [
    Credentials({
      // ... credentials config
      async authorize(creds) {
        try {
          const parsed = LoginSchema.safeParse(creds);
          if (!parsed.success) {
            console.warn("[Auth]: Validation failed in authorize");
            return null;
          }
          
          console.log(`[Auth]: Attempting login for ${parsed.data.email}`);
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
          });
          
          if (!user) {
            console.warn(`[Auth]: User not found: ${parsed.data.email}`);
            return null;
          }
          
          const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
          if (!ok) {
            console.warn(`[Auth]: Invalid password for ${parsed.data.email}`);
            return null;
          }
          
          console.log(`[Auth]: Login success for ${parsed.data.email}`);
          return { id: user.id, name: user.name, email: user.email };
        } catch (error) {
          console.error("[Auth]: Unexpected error in authorize:", error);
          return null;
        }
      },
    }),
  ],
});
```

- [ ] **Step 2: Commit changes**

```bash
git add app/_lib/auth.ts
git commit -m "feat(auth): add internal logger and authorize tracing"
```

### Task 4: Ensure Node.js Runtime for Auth Route

**Files:**
- Modify: `app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Set runtime to nodejs**

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/app/_lib/auth";

export const runtime = "nodejs";
export const { GET, POST } = handlers;
```

- [ ] **Step 2: Commit changes**

```bash
git add "app/api/auth/[...nextauth]/route.ts"
git commit -m "fix(auth): set nodejs runtime for auth API route"
```

### Task 5: Final Verification

**Files:**
- None

- [ ] **Step 1: Run project build**

```bash
npm run build
```

- [ ] **Step 2: Verify success**
Expected: Build passes with no TypeScript or hydration errors.

- [ ] **Step 3: Instructions for log checking**
Tell user to:
1. Deploy these changes to Vercel.
2. Attempt login on `dressingbear.com`.
3. Check Vercel "Functions" logs for `[NextAuth Error]` or `[Auth]` tags.
