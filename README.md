# SRM Panel Backend

Backend server for SRM Panel with Socket.IO real-time capabilities and multi-database provider support.

## Features

- ✅ Express.js REST API
- ✅ Socket.IO real-time communication
- ✅ Multi-database provider support (Supabase, Firebase, Socket.IO)
- ✅ JWT authentication
- ✅ Redis caching & job queue
- ✅ Prisma ORM
- ✅ TypeScript
- ✅ Winston logging
- ✅ Rate limiting
- ✅ CORS & Security (Helmet)

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

### 3. Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio
npm run prisma:studio
```

### 4. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /health
```

### API Base
```
GET /api/v1
```

## Project Structure

```
backend/
├── src/
│   ├── config/
│   │   └── env.ts           # Environment configuration
│   ├── middleware/
│   │   ├── auth.ts          # Authentication middleware
│   │   ├── validation.ts    # Request validation
│   │   └── errorHandler.ts  # Error handling
│   ├── routes/
│   │   ├── app-builder/     # App builder routes
│   │   ├── cloud-phone/     # Cloud phone routes
│   │   ├── firebase/        # Firebase proxy routes
│   │   └── auth/            # Auth routes
│   ├── services/
│   │   ├── encryption.service.ts
│   │   ├── firebase.service.ts
│   │   ├── geelark.service.ts
│   │   └── telegram.service.ts
│   ├── utils/
│   │   └── logger.ts        # Winston logger
│   └── index.ts             # Main server file
├── prisma/
│   └── schema.prisma        # Database schema
├── package.json
├── tsconfig.json
└── .env.example
```

## Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm test` - Run tests
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:studio` - Open Prisma Studio

## Environment Variables

See `.env.example` for all required environment variables.

## License

MIT
