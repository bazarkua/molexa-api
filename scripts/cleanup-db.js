// scripts/cleanup-db.js - Manual database cleanup
require('dotenv').config();
const analyticsDB = require('../api/analytics-db');

async function cleanupDatabase() {
    const retentionMonths = process.argv[2] ? parseInt(process.argv[2]) : 1;

    if (isNaN(retentionMonths) || retentionMonths < 1) {
        console.log('Usage: node scripts/cleanup-db.js [retention_months]');
        console.log('Example: node scripts/cleanup-db.js 1 (keeps current month only)');
        process.exit(1);
    }

    try {
        console.log(`🧹 Starting manual cleanup (keeping ${retentionMonths} months)...`);

        // Initialize DB connection
        await analyticsDB.initializeCache();

        const result = await analyticsDB.cleanupOldRequests(retentionMonths);

        console.log('✨ Cleanup complete!');
        console.log(`🗑️  Deleted: ${result.deleted} requests`);
        console.log(`📅 Cutoff: ${result.cutoff}`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
        process.exit(1);
    }
}

cleanupDatabase();
