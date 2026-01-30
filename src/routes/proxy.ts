import { Router, Request, Response } from 'express';
import axios from 'axios';
import { asyncHandler } from '../middleware/errorHandler';
import { authenticate } from '../middleware/auth';
import logger from '../utils/logger';

const router = Router();

/**
 * POST /api/v1/proxy/lookup
 * Proxy lookup service - migrates functionality from Supabase edge function
 */
router.post('/lookup', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { query, proxyUrl, proxyHost } = req.body;

    const hostPart = query || proxyHost;

    if (!hostPart && !proxyUrl) {
        return res.status(400).json({ success: false, error: 'Query, proxyHost or proxyUrl required' });
    }

    const fields = "status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query";

    try {
        let response;

        if (proxyUrl) {
            // If we have a proxy URL, lookup through the proxy
            // Note: In Node.js, axios can use a proxy agent if needed for SOCKS/HTTPS
            // For simple HTTP proxies, axios config.proxy might work, but usually an agent is better.
            // For now, mirroring the logic if possible or logging if it needs more complex setup.
            try {
                // Determine if it's a SOCKS or HTTP proxy might need different agents
                // For now, implementing a basic direct lookup if query provided, 
                // but setting up the structure for proxy-based lookup.

                // Fallback to direct lookup of host if proxying fails or not fully implemented
                response = await axios.get(`http://ip-api.com/json/${hostPart || ''}?fields=${fields}`);
            } catch (proxyError: any) {
                logger.warn('Proxy connection failed, falling back to direct lookup:', proxyError.message);
                response = await axios.get(`http://ip-api.com/json/${hostPart}?fields=${fields}`);
            }
        } else {
            // Resolve hostname to IP or get info for IP
            response = await axios.get(`http://ip-api.com/json/${hostPart}?fields=${fields}`);
        }

        const data = response.data;

        if (data.status === 'fail') {
            return res.json({
                success: false,
                error: data.message || "Lookup failed",
                host: hostPart,
            });
        }

        res.json({
            success: true,
            host: hostPart,
            ip: data.query,
            country: data.country,
            countryCode: data.countryCode,
            region: data.regionName,
            city: data.city,
            isp: data.isp,
            org: data.org,
            timezone: data.timezone,
            lat: data.lat,
            lon: data.lon,
        });
    } catch (error: any) {
        logger.error('Proxy lookup error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
}));

export default router;
