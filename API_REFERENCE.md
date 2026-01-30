# API Routes Quick Reference

## Base URL
```
http://localhost:3000/api/v1
```

## Implemented Endpoints (17/40)

### Health & Info
- `GET /health` - Server health check
- `GET /api/v1` - API information

### Firebase Proxy
- `POST /api/v1/firebase/proxy`
  ```json
  {
    "action": "read|write|delete",
    "path": "clients/123",
    "config": {
      "databaseURL": "https://project.firebaseio.com"
    },
    "data": {} // for write operations
  }
  ```

### Cloud Phones
- `GET /api/v1/cloud-phones?apiKey=xxx&page=1&pageSize=100`
- `POST /api/v1/cloud-phones` - Body: `{ apiKey, ...params }`
- `DELETE /api/v1/cloud-phones/:id` - Body: `{ apiKey }`
- `POST /api/v1/cloud-phones/:id/start` - Body: `{ apiKey }`
- `POST /api/v1/cloud-phones/:id/control` - Body: `{ apiKey, action }`
- `POST /api/v1/cloud-phones/:id/screenshot` - Body: `{ apiKey }`
- `GET /api/v1/cloud-phones/:id/apps?apiKey=xxx`
- `POST /api/v1/cloud-phones/:id/apps/download` - Body: `{ apiKey, appUrl }`
- `POST /api/v1/cloud-phones/:id/google-login` - Body: `{ apiKey, email, password }`
- `PATCH /api/v1/cloud-phones/:id` - Body: `{ apiKey, ...settings }`
- `GET /api/v1/cloud-phones/brands?apiKey=xxx`
- `GET /api/v1/cloud-phones/groups?apiKey=xxx`
- `GET /api/v1/cloud-phones/tasks?apiKey=xxx`

### Authentication
- `POST /api/v1/auth/2fa/send`
  ```json
  {
    "supabaseUserId": "uuid",
    "email": "user@example.com",
    "telegramChatId": "optional"
  }
  ```
- `POST /api/v1/auth/2fa/verify`
  ```json
  {
    "supabaseUserId": "uuid",
    "code": "123456"
  }
  ```

## Authentication

Most endpoints will require authentication via Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_SUPABASE_TOKEN" \
  http://localhost:3000/api/v1/endpoint
```

## Testing Examples

### Health Check
```bash
curl http://localhost:3000/health
```

### API Info
```bash
curl http://localhost:3000/api/v1
```

### List Cloud Phones
```bash
curl "http://localhost:3000/api/v1/cloud-phones?apiKey=YOUR_API_KEY&page=1"
```

### Send 2FA Code
```bash
curl -X POST http://localhost:3000/api/v1/auth/2fa/send \
  -H "Content-Type: application/json" \
  -d '{
    "supabaseUserId": "user-uuid",
    "email": "user@example.com"
  }'
```

## Remaining Endpoints (23/40)

### App Builder (13)
- POST `/api/v1/app-builder/apps` - Create app
- GET `/api/v1/app-builder/apps` - List apps
- POST `/api/v1/app-builder/apps/:id/build` - Trigger build
- GET `/api/v1/app-builder/apps/:id/status` - Build status
- DELETE `/api/v1/app-builder/apps/:id/build` - Cancel build
- POST `/api/v1/app-builder/apps/:id/clone` - Clone app
- DELETE `/api/v1/app-builder/apps/:id` - Delete app
- GET/PUT `/api/v1/app-builder/apps/:id/config` - App config
- GET `/api/v1/app-builder/apps/:id/logs` - Build logs
- GET `/api/v1/app-builder/apps/:id/download` - Download APK
- GET/PUT `/api/v1/app-builder/providers/:id/config` - Provider config
- POST `/api/v1/app-builder/providers/:id/test` - Test provider
- GET/PUT `/api/v1/app-builder/firebase/config` - Firebase config

### External Data (2)
- POST `/api/v1/external/data` - Fetch external data
- POST `/api/v1/external/devices` - Fetch external devices

### Utilities (8)
- POST `/api/v1/notifications/telegram` - Send Telegram
- POST `/api/v1/users/sync` - Sync user profile
- POST `/api/v1/audit/log` - Log action
- POST `/api/v1/proxy/lookup` - Proxy lookup
- POST `/api/v1/external/command` - Send external command
- POST `/api/v1/sms/auto-forward` - Auto-forward SMS
- ALL `/api/v1/mobile/*` - Mobile API
- POST `/api/v1/admin/users` - Create admin user
