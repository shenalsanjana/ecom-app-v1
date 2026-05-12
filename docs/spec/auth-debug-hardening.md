# Specification: Auth Debug Hardening and Logging

## Goal
The goal is to diagnose and resolve the persistent "server configuration" error in NextAuth v5 on the production domain (`www.dressingbear.com`). This error currently prevents registered users from logging in by redirecting them to a JSON error message on the callback URL.

## User Impact
- **Problem:** Registered users cannot log in.
- **Symptom:** Redirection to `{"message":"There was a problem with the server configuration. Check the server logs for more information."}`.
- **Resolution:** By implementing detailed logging and hardening the configuration, we will identify the root cause (e.g., DB connection, secret mismatch, or host header issues) and apply a permanent fix.

## Technical Approach

### 1. Enhanced NextAuth Logger
Add a custom `logger` to the `NextAuth` initialization to capture internal framework errors.
- Intercept `error`, `warn`, and `debug` events.
- Log these to the console so they appear in Vercel's real-time function logs.

### 2. Traceable Authorize Function
Wrap the `authorize` logic in a try-catch block to distinguish between:
- Validation failures (Invalid email/password format).
- Database connection errors (Prisma timeouts or credentials).
- User discovery failures (User not found or password mismatch).

### 3. Runtime and Configuration Consolidation
- Ensure the `nodejs` runtime is respected across the auth path.
- Consolidate `trustHost: true` and `secret` in both `auth.ts` and `auth.config.ts`.

## Requirements Checklist
- [ ] Add `logger` object to `NextAuth` config in `app/_lib/auth.ts`.
- [ ] Add try/catch and logging to `authorize` in `app/_lib/auth.ts`.
- [ ] Ensure `secret` is explicitly passed in `app/_lib/auth.config.ts`.
- [ ] Verify `trustHost: true` is present in all auth configs.
- [ ] Project builds successfully with `npm run build`.

## Success Criteria
- Detailed logs appear in Vercel when a login attempt fails.
- The root cause of the "server configuration" error is identified.
- (Final Goal) Successful login redirecting back to the application instead of the JSON error.
