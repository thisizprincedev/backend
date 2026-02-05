import tracer from 'dd-trace';
import config from '../config/env';

// Initialize Datadog APM
tracer.init({
    apmTracingEnabled: process.env.DD_TRACE_ENABLED !== 'false',
    env: config.env,
    service: 'srm-panel-backend',
    version: '1.0.0',
    logInjection: true,
    sampleRate: parseFloat(process.env.DD_TRACE_SAMPLE_RATE || '1.0'), // Default to 100%, can be lowered
});

export default tracer;
