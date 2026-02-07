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
    auth: {
        mobileApiKey: string;
        socketioProviderAdminToken: string;
        socketioProviderUrl: string;
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
    mqtt: {
        url: string;
        username?: string;
        password?: string;
    };
    nats: {
        user: string;
        pass: string;
        issuerPublicKey: string;
        issuerSeed: string;
        accountPublicKey: string;
    };
    logging: {
        level: string;
        consoleLevel: string;
        elasticsearch: {
            node: string;
            indexPrefix: string;
            username?: string;
            password?: string;
            enabled: boolean;
        };
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
    auth: {
        mobileApiKey: process.env.MOBILE_API_ACCESS_KEY || 'srm-mobile-default-key-12345',
        socketioProviderAdminToken: process.env.SOCKETIO_PROVIDER_ADMIN_TOKEN || 'srm-admin-secret-998877',
        socketioProviderUrl: process.env.SOCKETIO_PROVIDER_URL || 'http://localhost:3001',
    },

    firebase: {
        serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT
            ? (() => {
                try {
                    let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT!.trim();

                    // Robust unquoting: Handle cases where the string is wrapped in ' or "
                    if ((jsonString.startsWith("'") && jsonString.endsWith("'")) ||
                        (jsonString.startsWith('"') && jsonString.endsWith('"'))) {
                        jsonString = jsonString.substring(1, jsonString.length - 1);
                    }

                    // Handle escaped quotes if they still exist
                    if (jsonString.includes('\\"')) {
                        jsonString = jsonString.replace(/\\"/g, '"');
                    }

                    return JSON.parse(jsonString);
                } catch (error) {
                    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', error);
                    console.error('Raw value:', process.env.FIREBASE_SERVICE_ACCOUNT);
                    return null;
                }
            })()
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

    mqtt: {
        url: process.env.MQTT_URL || 'mqtt://localhost:1883',
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
    },
    nats: {
        user: process.env.NATS_USER || 'srm_backend',
        pass: process.env.NATS_PASSWORD || 'strong_password_123',
        issuerPublicKey: process.env.NATS_ISSUER_PUBLIC_KEY || '',
        issuerSeed: process.env.NATS_ISSUER_SEED || '',
        accountPublicKey: process.env.NATS_ACCOUNT_PUBLIC_KEY || 'AADCTUHEPBJKE5L74CWHSV2T3NMXGKRZMSTST3IFLKVA2MUW33CRRLWQ',
    },
    logging: {
        level: process.env.LOG_LEVEL || 'warn',
        consoleLevel: process.env.CONSOLE_LOG_LEVEL || 'warn',
        elasticsearch: {
            node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
            indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX || 'srm-panel',
            username: process.env.ELASTICSEARCH_USERNAME,
            password: process.env.ELASTICSEARCH_PASSWORD,
            enabled: process.env.ELASTICSEARCH_ENABLED === 'true',
        },
    },
};

export default config;
