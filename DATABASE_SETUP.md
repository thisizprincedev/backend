# Database Setup Guide

## Prerequisites

You need a PostgreSQL database. You can use:
1. **Supabase** (recommended - you already have this)
2. Local PostgreSQL
3. Any cloud PostgreSQL provider

---

## Option 1: Using Existing Supabase Database (Recommended)

### Step 1: Get Your Database URL

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Database**
3. Under **Connection string**, copy the **Connection pooling** URL (with `[YOUR-PASSWORD]` placeholder)
4. Replace `[YOUR-PASSWORD]` with your actual database password

Example:
```
postgresql://postgres.abcdefghijk:your-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### Step 2: Update .env File

Update `backend/.env`:
```env
DATABASE_URL=postgresql://postgres.YOUR-PROJECT:YOUR-PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### Step 3: Run Migrations

```bash
cd backend
npx prisma migrate dev --name init
```

This will create all the required tables in your Supabase database.

---

## Option 2: Using Local PostgreSQL

### Step 1: Install PostgreSQL

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Step 2: Create Database

```bash
# Connect to PostgreSQL
psql postgres

# Create database
CREATE DATABASE srm_panel;

# Create user (optional)
CREATE USER srm_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE srm_panel TO srm_user;

# Exit
\q
```

### Step 3: Update .env File

```env
DATABASE_URL=postgresql://srm_user:your_password@localhost:5432/srm_panel
```

### Step 4: Run Migrations

```bash
cd backend
npx prisma migrate dev --name init
```

---

## What Gets Created

The migration will create these tables:

### Core Tables
- `database_providers` - Multi-database provider configurations
- `applications` - App builder applications
- `command_queue` - Command queue for device operations
- `websocket_sessions` - Socket.IO session tracking
- `rate_limits` - API rate limiting
- `audit_logs` - User action audit logs
- `device_app_assignments` - Device-to-app mappings

### Enums
- `DatabaseProviderType` - SUPABASE, FIREBASE, SOCKET_IO
- `CommandStatus` - pending, processing, completed, failed, cancelled

---

## Verify Setup

### 1. Check Prisma Client

```bash
cd backend
npx prisma generate
```

Should output: ✔ Generated Prisma Client

### 2. Check Database Connection

```bash
npx prisma db push
```

Should connect successfully and show no changes needed.

### 3. Open Prisma Studio (Optional)

```bash
npx prisma studio
```

Opens a web UI at http://localhost:5555 to view your database.

---

## Troubleshooting

### Error: "Can't reach database server"

**Solution**: Check your DATABASE_URL is correct
```bash
# Test connection
psql "postgresql://user:password@host:port/database"
```

### Error: "SSL connection required"

**Solution**: Add `?sslmode=require` to your DATABASE_URL
```env
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
```

### Error: "Database does not exist"

**Solution**: Create the database first
```bash
createdb srm_panel
```

### Error: "Permission denied"

**Solution**: Grant proper permissions
```sql
GRANT ALL PRIVILEGES ON DATABASE srm_panel TO your_user;
GRANT ALL ON SCHEMA public TO your_user;
```

---

## Next Steps

After database setup:

1. ✅ Prisma client generated
2. ✅ Database tables created
3. **Start backend server**
   ```bash
   npm run dev
   ```
4. **Test API endpoints**
   ```bash
   curl http://localhost:3000/health
   ```

---

## Production Considerations

### 1. Connection Pooling

Use connection pooling for better performance:
```env
DATABASE_URL=postgresql://user:password@host:5432/database?pgbouncer=true&connection_limit=10
```

### 2. SSL Mode

Always use SSL in production:
```env
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=require
```

### 3. Migrations

Run migrations in production:
```bash
npx prisma migrate deploy
```

(Use `migrate deploy` instead of `migrate dev` in production)

---

## Useful Commands

```bash
# Generate Prisma client
npx prisma generate

# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations (production)
npx prisma migrate deploy

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio

# Format schema file
npx prisma format

# Validate schema
npx prisma validate
```

---

## Database Schema Diagram

```
┌─────────────────────┐
│ database_providers  │
├─────────────────────┤
│ id (uuid)           │
│ name                │
│ provider_type       │
│ config (json)       │
│ is_active           │
│ tenant_id           │
│ created_by          │
└──────────┬──────────┘
           │
           │ 1:N
           ↓
┌─────────────────────┐
│   applications      │
├─────────────────────┤
│ id (uuid)           │
│ app_name            │
│ package_name        │
│ database_provider_id│
│ config (json)       │
│ is_default          │
│ universal_realtime  │
└─────────────────────┘

┌─────────────────────┐
│   command_queue     │
├─────────────────────┤
│ id (uuid)           │
│ device_id           │
│ command_type        │
│ payload (json)      │
│ status              │
│ priority            │
│ retry_count         │
└─────────────────────┘

┌─────────────────────┐
│ websocket_sessions  │
├─────────────────────┤
│ id (uuid)           │
│ socket_id           │
│ device_id           │
│ user_id             │
│ connected_at        │
│ last_ping           │
└─────────────────────┘
```

---

## Support

If you encounter issues:
1. Check Prisma logs
2. Verify DATABASE_URL format
3. Test database connection directly
4. Check Supabase dashboard for errors
