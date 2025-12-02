// scripts/inspect-analytics.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectAnalytics() {
    console.log('🔍 Inspecting Analytics Data...');

    try {
        // Get current month
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        console.log(`📅 Checking summary for: ${currentMonth}`);

        const { data: summary, error } = await supabase
            .from('monthly_summaries')
            .select('*')
            .eq('month_year', currentMonth)
            .single();

        if (error) {
            console.error('❌ Error fetching summary:', error.message);
            return;
        }

        if (!summary) {
            console.log('⚠️ No summary found for this month.');
            return;
        }

        console.log('\n📊 Total Requests:', summary.total_requests);
        console.log('\n📈 Requests by Type (Raw JSON):');
        console.log(JSON.stringify(summary.requests_by_type, null, 2));

        // Calculate what the backend is currently reporting
        const requestsByType = summary.requests_by_type || {};
        const currentMetrics = {
            educational: (requestsByType['Educational Overview'] || 0) +
                (requestsByType['Educational Annotations'] || 0),
            safety: requestsByType['Safety Data'] || 0,
            search: (requestsByType['Autocomplete'] || 0) +
                (requestsByType['Name Search'] || 0) +
                (requestsByType['CID Lookup'] || 0) +
                (requestsByType['Formula Search'] || 0) +
                (requestsByType['SMILES Search'] || 0)
        };

        console.log('\n🧮 Calculated Metrics (Current Logic):');
        console.log(currentMetrics);

        const calculatedTotal = currentMetrics.educational + currentMetrics.safety + currentMetrics.search;
        console.log(`\n⚠️ Unaccounted Requests: ${summary.total_requests - calculatedTotal}`);

    } catch (error) {
        console.error('❌ Unexpected error:', error);
    }
}

inspectAnalytics();
