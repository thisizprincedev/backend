import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import config from '../../config/env';
import { authenticate } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/errorHandler';
import logger from '../../utils/logger';

const router = Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

/**
 * GET /api/v1/transactions/analysis
 * List transaction analysis history
 */
router.get('/analysis', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { databaseId, limit = 50, offset = 0 } = req.query;

    let query = supabase
        .from('transaction_analysis')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })
        .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (databaseId) {
        query = query.eq('database_id', databaseId);
    }

    const { data: analyses, error } = await query;

    if (error) throw error;

    res.json({
        success: true,
        analyses: analyses.map(analysis => ({
            id: analysis.id,
            analysisDate: analysis.analysis_date,
            databaseId: analysis.database_id,
            createdBy: analysis.created_by,
            totalCredit: analysis.total_credit,
            totalDebit: analysis.total_debit,
            netFlow: analysis.net_flow,
            bankBreakdown: analysis.bank_breakdown,
            deviceCount: analysis.device_count,
            transactionCount: Array.isArray(analysis.transactions) ? analysis.transactions.length : 0,
            createdAt: analysis.created_at,
        })),
        pagination: {
            limit: Number(limit),
            offset: Number(offset),
            count: analyses.length,
        },
    });
}));

/**
 * GET /api/v1/transactions/analysis/:id
 * Load specific transaction analysis
 */
router.get('/analysis/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.id;

    const { data: analysis, error } = await supabase
        .from('transaction_analysis')
        .select('*')
        .eq('id', id)
        .eq('created_by', userId)
        .maybeSingle();

    if (error) throw error;

    if (!analysis) {
        return res.status(404).json({
            success: false,
            error: 'Analysis not found or access denied',
        });
    }

    return res.json({
        success: true,
        analysis: {
            id: analysis.id,
            analysisDate: analysis.analysis_date,
            databaseId: analysis.database_id,
            createdBy: analysis.created_by,
            transactions: analysis.transactions,
            totalCredit: analysis.total_credit,
            totalDebit: analysis.total_debit,
            netFlow: analysis.net_flow,
            bankBreakdown: analysis.bank_breakdown,
            deviceCount: analysis.device_count,
            createdAt: analysis.created_at,
        },
    });
}));

/**
 * POST /api/v1/transactions/analysis
 * Save new transaction analysis
 */
router.post('/analysis', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const {
        analysisDate,
        databaseId,
        transactions,
        totalCredit,
        totalDebit,
        netFlow,
        bankBreakdown,
        deviceCount,
    } = req.body;

    if (!analysisDate || !transactions || !Array.isArray(transactions)) {
        return res.status(400).json({
            success: false,
            error: 'analysisDate and transactions array are required',
        });
    }

    const { data: analysis, error } = await supabase
        .from('transaction_analysis')
        .insert({
            analysis_date: analysisDate,
            database_id: databaseId || null,
            created_by: userId,
            transactions,
            total_credit: totalCredit || 0,
            total_debit: totalDebit || 0,
            net_flow: netFlow || 0,
            bank_breakdown: bankBreakdown || {},
            device_count: deviceCount || 0,
        })
        .select()
        .single();

    if (error) throw error;

    logger.info(`Transaction analysis saved: ${analysis.id} by user ${userId}, ${transactions.length} transactions`);

    res.json({
        success: true,
        analysis: {
            id: analysis.id,
            analysisDate: analysis.analysis_date,
            databaseId: analysis.database_id,
            createdBy: analysis.created_by,
            totalCredit: analysis.total_credit,
            totalDebit: analysis.total_debit,
            netFlow: analysis.net_flow,
            bankBreakdown: analysis.bank_breakdown,
            deviceCount: analysis.device_count,
            transactionCount: transactions.length,
            createdAt: analysis.created_at,
        },
    });
}));

/**
 * DELETE /api/v1/transactions/analysis/old/:days
 * Clear old transaction analysis records
 */
router.delete('/analysis/old/:days', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const { days } = req.params;
    const userId = req.user!.id;
    const { databaseId } = req.query;

    const daysNum = parseInt(days, 10);
    if (isNaN(daysNum) || daysNum < 1) {
        return res.status(400).json({
            success: false,
            error: 'Invalid days parameter',
        });
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNum);

    let query = supabase
        .from('transaction_analysis')
        .delete()
        .eq('created_by', userId)
        .lt('created_at', cutoffDate.toISOString());

    if (databaseId) {
        query = query.eq('database_id', databaseId);
    }

    const { error, count } = await query;

    if (error) throw error;

    logger.info(`Deleted ${count || 0} old transaction analyses (older than ${daysNum} days) for user ${userId}`);

    res.json({
        success: true,
        message: `Deleted ${count || 0} old analyses`,
        deletedCount: count || 0,
    });
}));

/**
 * DELETE /api/v1/transactions/analysis/all
 * Clear all transaction analysis records for user
 */
router.delete('/analysis/all', authenticate, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { databaseId } = req.query;

    let query = supabase
        .from('transaction_analysis')
        .delete()
        .eq('created_by', userId);

    if (databaseId) {
        query = query.eq('database_id', databaseId);
    }

    const { error, count } = await query;

    if (error) throw error;

    logger.info(`Deleted all ${count || 0} transaction analyses for user ${userId}`);

    res.json({
        success: true,
        message: `Deleted ${count || 0} analyses`,
        deletedCount: count || 0,
    });
}));

export default router;
