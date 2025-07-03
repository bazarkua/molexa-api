// scripts/archive-month.js - Manual archival script
require('dotenv').config();
const analyticsDB = require('../api/analytics-db');

async function archiveMonth() {
  const monthYear = process.argv[2];
  
  if (!monthYear) {
    console.log('Usage: node scripts/archive-month.js YYYY-MM');
    console.log('Example: node scripts/archive-month.js 2025-01');
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}$/.test(monthYear)) {
    console.log('Invalid format. Use YYYY-MM format (e.g., 2025-01)');
    process.exit(1);
  }

  try {
    console.log(`📊 Archiving data for ${monthYear}...`);
    const filename = await analyticsDB.archiveMonth(monthYear);
    console.log(`✅ Successfully archived to: ${filename}`);
  } catch (error) {
    console.error('❌ Archive failed:', error.message);
    process.exit(1);
  }
}

archiveMonth();

// scripts/generate-report.js - Generate analytics report
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function generateReport() {
  const monthYear = process.argv[2] || getCurrentMonth();
  
  try {
    console.log(`📊 Generating report for ${monthYear}...`);
    
    // Get summary data
    const { data: summary, error: summaryError } = await supabase
      .from('monthly_summaries')
      .select('*')
      .eq('month_year', monthYear)
      .single();

    if (summaryError) {
      console.error('❌ No data found for', monthYear);
      return;
    }

    // Get detailed request data
    const { data: requests, error: requestsError } = await supabase
      .from('api_requests')
      .select('request_type, response_status, response_time_ms, timestamp')
      .eq('month_year', monthYear);

    if (requestsError) throw requestsError;

    // Generate report
    const report = {
      month: monthYear,
      summary: summary,
      insights: {
        mostPopularEndpoint: Object.entries(summary.requests_by_type)
          .sort(([,a], [,b]) => b - a)[0],
        averageResponseTime: summary.average_response_time,
        successRate: calculateSuccessRate(requests),
        dailyAverage: Math.round(summary.total_requests / 30),
        topErrorCodes: getTopErrorCodes(requests)
      },
      generated_at: new Date().toISOString()
    };

    // Save report
    const reportPath = `reports/molexa-report-${monthYear}.json`;
    await fs.mkdir('reports', { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`✅ Report generated: ${reportPath}`);
    console.log(`📊 Total Requests: ${summary.total_requests}`);
    console.log(`🏆 Most Popular: ${report.insights.mostPopularEndpoint[0]} (${report.insights.mostPopularEndpoint[1]} requests)`);
    console.log(`⚡ Avg Response Time: ${summary.average_response_time}ms`);
    console.log(`✅ Success Rate: ${report.insights.successRate}%`);

  } catch (error) {
    console.error('❌ Report generation failed:', error.message);
    process.exit(1);
  }
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function calculateSuccessRate(requests) {
  if (!requests || requests.length === 0) return 100;
  const successful = requests.filter(r => r.response_status >= 200 && r.response_status < 400).length;
  return Math.round((successful / requests.length) * 100);
}

function getTopErrorCodes(requests) {
  const errorCodes = {};
  requests.forEach(r => {
    if (r.response_status >= 400) {
      errorCodes[r.response_status] = (errorCodes[r.response_status] || 0) + 1;
    }
  });
  return Object.entries(errorCodes)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);
}

if (require.main === module) {
  generateReport();
}

// scripts/setup-database.js - Database setup helper
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function setupDatabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('📊 Setting up analytics database...');

  try {
    // Test connection
    const { data, error } = await supabase.from('api_requests').select('count', { count: 'exact' }).limit(1);
    
    if (error) {
      console.log('📝 Database tables need to be created. Please run the SQL schema in your Supabase SQL editor.');
      console.log('See the setup guide for the complete SQL schema.');
    } else {
      console.log('✅ Database connection successful!');
      console.log(`📊 Current request count: ${data.length}`);
    }
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
  }
}

if (require.main === module) {
  setupDatabase();
}