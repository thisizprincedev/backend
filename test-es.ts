import { monitoringService } from './src/services/monitoring.service';
import config from './src/config/env';

async function testSearch() {
    console.log('Testing ES Search...');
    console.log('Config ES Enabled:', config.logging.elasticsearch.enabled);
    console.log('Config ES Node:', config.logging.elasticsearch.node);

    try {
        const results = await monitoringService.searchLogs('GET', undefined, 5);
        console.log('Results count:', results.length);
        if (results.length > 0) {
            console.log('First result:', JSON.stringify(results[0], null, 2));
        } else {
            console.log('No results found.');
        }
    } catch (error) {
        console.error('Test search failed:', error);
    }
    process.exit(0);
}

testSearch();
