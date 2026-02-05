# Fix "Failed to create table" Error - Root Cause and Plan

## Root Cause Analysis

The error `{"error":{"code":"INTERNAL_ERROR","message":"Failed to create table"}}` is a **generic 500 response** from `POST /v1/admin/tables`. The real error occurs inside the API but is **not returned to the client**—it is only logged server-side.

### Where the error originates

In [apps/api/src/routes/admin.ts](apps/api/src/routes/admin.ts) (lines 36–67), the create-table flow:

1. Parses and validates the request body (succeeds—otherwise you'd get 400 VALIDATION_ERROR)
2. Calls `db.createTable(...)` → Supabase `tables` insert
3. Calls `db.createSeats(...)` → Supabase `seats` insert  
4. Calls `db.getSeats(...)` → Supabase `seats` select

Any Supabase/DB error in these steps is caught, logged with `fastify.log.error(err, 'Failed to create table')`, and replaced with the generic INTERNAL_ERROR response.

### Most likely causes

| Cause | How to verify |
|-------|---------------|
| **1. Missing/invalid `SUPABASE_SERVICE_ROLE_KEY`** | Check `.env` / `.env.local`. Config defaults to `''` when unset; Supabase will reject requests. |
| **2. Supabase not running** | Local: run `npx supabase start` and confirm API URL (usually `http://127.0.0.1:54321`). |
| **3. Migrations not applied** | Run `pnpm db:migrate` or `supabase db push`. Verify tables `agents`, `tables`, `seats`, `sessions`, `events` exist. |
| **4. Wrong `SUPABASE_URL`** | Local: often `http://127.0.0.1:54321` (not `localhost`). Use `supabase status` for correct values. |

---

## Proposed Fixes

### 1. Improve error visibility (primary fix)

**Goal:** Make it possible to see the real error without digging into server logs.

**Option A – Return underlying error in development**

In [apps/api/src/routes/admin.ts](apps/api/src/routes/admin.ts), change the catch block (lines 60–67) to include the underlying error when `config.nodeEnv === 'development'`:

```typescript
} catch (err) {
  fastify.log.error(err, 'Failed to create table');
  const message = err instanceof Error ? err.message : String(err);
  return reply.status(500).send({
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'Failed to create table',
      ...(config.nodeEnv === 'development' && { details: message }),
    },
  });
}
```

**Option B – Return Supabase error code in all environments**

Surface the Supabase error code (e.g. `PGRST301`, `23505`) so clients can distinguish auth, constraint, and connection issues without exposing full messages in production.

### 2. Startup validation (optional)

**Goal:** Fail fast if Supabase is misconfigured.

In [apps/api/src/db.ts](apps/api/src/db.ts) or before routes register, add a startup check:

- If `SUPABASE_SERVICE_ROLE_KEY` is empty → log warning or fail with a clear message
- Optional: run a simple `SELECT 1` or `from('tables').select().limit(1)` to confirm connectivity

### 3. Documentation

**Goal:** Reduce setup mistakes.

- Ensure `.env.example` exists with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and how to obtain them
- Add a “ troubleshooting” section in README for this error (Supabase running, migrations, env vars)

---

## Recommended order

1. **Immediate:** Improve error visibility (Option A) so you can see the actual error.
2. **Quick check:** Confirm Supabase is running, migrations are applied, and `.env` / `.env.local` have correct `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. **Later:** Add startup validation and `.env.example` if not already present.

---

## Next steps for you

1. Check API server logs when the error occurs—the real error should appear there.
2. Confirm:
   - `npx supabase start` (if using local Supabase)
   - `pnpm db:migrate` or `supabase db push`
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env` or `.env.local`
3. Decide whether to apply Option A (or B) for better error reporting.
