import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

// Initialize Prometheus metrics
const register = new client.Registry();

// Add default metrics (CPU, Memory, etc.)
client.collectDefaultMetrics({ register });

// Define custom metrics
export const httpRequestDurationMicroseconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in microseconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.1, 0.5, 1, 2, 5]
});

export const httpRequestCount = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code']
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestCount);

/**
 * Middleware to track HTTP metrics
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route?.path || req.path;

        httpRequestDurationMicroseconds
            .labels(req.method, route, res.statusCode.toString())
            .observe(duration);

        httpRequestCount
            .labels(req.method, route, res.statusCode.toString())
            .inc();
    });

    next();
};

/**
 * Controller to expose metrics endpoint
 */
export const metricsEndpoint = async (_req: Request, res: Response) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
};

export default register;
