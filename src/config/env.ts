import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface Config {
    env: string;
    port: number;
    apiVersion: string;
    database: {
        url: string;
    };
    redis: {
        url: string;
    };
    supabase: {
        url: string;
        anonKey: string;
        serviceRoleKey: string;
    };
    jwt: {
        secret: string;
        expiresIn: string;
    };
    firebase: {
        serviceAccount: any;
    };
    encryption: {
        key: string;
    };
    telegram: {
        botToken: string;
        adminChatId: string;
    };
    cors: {
        origin: string[];
    };
    socket: {
        corsOrigin: string[];
    };
    logging: {
        level: string;
    };
}

const config: Config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiVersion: process.env.API_VERSION || 'v1',

    database: {
        url: process.env.DATABASE_URL || '',
    },

    redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
    },

    supabase: {
        url: process.env.SUPABASE_URL || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },

    jwt: {
        secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },

    firebase: {
        serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
            : null,
    },

    encryption: {
        key: process.env.APP_BUILDER_ENCRYPTION_KEY || '',
    },

    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || '',
    },

    cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    },

    socket: {
        corsOrigin: process.env.SOCKET_CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    },

    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },
};

export default config;
