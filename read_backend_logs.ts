import logger from './src/utils/logger';

async function readLogs() {
    const logs = logger.getRecentLogs();
    console.log(JSON.stringify(logs, null, 2));
}

readLogs();
Broadway
