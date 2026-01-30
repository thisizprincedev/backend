# Quick Fix Guide for Database Connection Error

## Problem
Your DATABASE_URL is pointing to an unreachable database server.

## Solution

### Step 1: Get Your Correct Supabase Database URL

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Click on your project
3. Go to **Settings** (gear icon) → **Database**
4. Scroll down to **Connection string**
5. Select **Connection pooling** tab
6. Copy the connection string (it will have `[YOUR-PASSWORD]` in it)
7. Replace `[YOUR-PASSWORD]` with your actual database password

The URL should look like:
```
postgresql://postgres.XXXXX:YOUR-PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### Step 2: Update Your .env File

Replace the DATABASE_URL line in `backend/.env` with your actual connection string.

**Current (incorrect):**
```env
DATABASE_URL=postgresql://postgres:password@db.fdfvjfjstryutxydypeg.supabase.co:5432/postgres
```

**Should be (example):**
```env
DATABASE_URL=postgresql://postgres.abcdefghijk:your-actual-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### Step 3: Test Connection

```bash
# Test if you can connect
npx prisma db pull
```

If successful, you'll see: "Introspecting based on datasource..."

### Step 4: Run Migrations

```bash
npx prisma migrate dev --name init
```

---

## Alternative: Use Direct Connection (Not Pooling)

If pooling doesn't work, try the direct connection:

1. In Supabase Dashboard → Settings → Database
2. Under **Connection string**, select **Session mode** tab
3. Copy that URL instead
4. It will use port **5432** instead of **6543**

---

## Still Having Issues?

### Option 1: Skip Database for Now

The backend will still work without database migrations. You just won't be able to use features that require database storage.

### Option 2: Use Local PostgreSQL

See `backend/DATABASE_SETUP.md` for instructions on setting up a local database.

---

## Quick Test

After updating DATABASE_URL, test it:

```bash
# This should connect successfully
npx prisma db pull
```

If it works, then run:
```bash
npx prisma migrate dev --name init
```
