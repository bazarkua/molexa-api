// analytics-db.js - Database-backed analytics system for moleXa API

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client (free tier: 500MB, 2 databases)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Database tables schema:
/*
CREATE TABLE api_requests (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  method VARCHAR(10) NOT NULL,
  endpoint TEXT NOT NULL,
  ip_hash VARCHAR(64), -- hashed for privacy
  user_agent_hash VARCHAR(64), -- hashed for privacy
  request_type VARCHAR(50) NOT NULL,
  response_status INTEGER,
  response_time_ms INTEGER,
  month_year VARCHAR(7) NOT NULL, -- '2025-01' for easy archival
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE monthly_summaries (
  id SERIAL PRIMARY KEY,
  month_year VARCHAR(7) NOT NULL UNIQUE,
  total_requests INTEGER DEFAULT 0,
  requests_by_type JSONB DEFAULT '{}',
  requests_by_endpoint JSONB DEFAULT '{}',
  average_response_time FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_api_requests_month_year ON api_requests(month_year);
CREATE INDEX idx_api_requests_timestamp ON api_requests(timestamp);
CREATE INDEX idx_api_requests_type ON api_requests(request_type);
*/

class AnalyticsDB {
  constructor() {
    this.currentMonth = this.getCurrentMonth();
    this.cache = {
      totalRequests: 0,
      recentRequests: [],
      requestsByType: {},
      requestsByEndpoint: {},
      startTime: new Date()
    };
    this.initializeCache();
  }

  getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // Initialize cache from database
  async initializeCache() {
    if (!supabase) {
      console.log('📊 Analytics: Using memory-only mode (no database configured)');
      return;
    }

    try {
      // Get current month summary
      const { data: summary } = await supabase
        .from('monthly_summaries')
        .select('*')
        .eq('month_year', this.currentMonth)
        .single();

      if (summary) {
        this.cache.totalRequests = summary.total_requests;
        this.cache.requestsByType = summary.requests_by_type || {};
        this.cache.requestsByEndpoint = summary.requests_by_endpoint || {};
      }

      // Get recent requests (last 50)
      const { data: recentRequests } = await supabase
        .from('api_requests')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50);

      if (recentRequests) {
        this.cache.recentRequests = recentRequests.map(r => ({
          id: r.id,
          timestamp: r.timestamp,
          method: r.method,
          endpoint: r.endpoint,
          type: r.request_type
        }));
      }

      console.log(`📊 Analytics cache initialized: ${this.cache.totalRequests} total requests`);
    } catch (error) {
      console.error('❌ Error initializing analytics cache:', error);
    }
  }

  // Check if this request should be tracked
  shouldTrackRequest(url, method) {
    // Only track actual API usage, not documentation or meta endpoints
    const trackablePatterns = [
      '/api/pubchem/',
      '/api/pugview/',
      '/api/autocomplete/'
    ];

    // Exclude documentation and meta endpoints
    const excludePatterns = [
      '/api/docs',
      '/api/analytics',
      '/api/health',
      '/api/dashboard',
      '/api/json/docs'
    ];

    // Check if URL should be excluded
    if (excludePatterns.some(pattern => url.includes(pattern))) {
      return false;
    }

    // Check if URL is trackable
    return trackablePatterns.some(pattern => url.includes(pattern));
  }

  // Categorize request type based on URL
  categorizeRequest(url) {
    if (url.includes('/educational')) return 'Educational Overview';
    if (url.includes('/safety')) return 'Safety Data';
    if (url.includes('/pharmacology')) return 'Pharmacology';
    if (url.includes('/properties')) return 'Properties';
    if (url.includes('/autocomplete')) return 'Autocomplete';
    if (url.includes('/pugview')) return 'Educational Annotations';
    if (url.includes('/compound/name/')) return 'Name Search';
    if (url.includes('/compound/cid/')) return 'CID Lookup';
    if (url.includes('/compound/formula/')) return 'Formula Search';
    if (url.includes('/compound/smiles/')) return 'SMILES Search';
    if (url.includes('.PNG')) return 'Structure Image';
    if (url.includes('.SDF')) return 'Structure File';
    return 'Other API';
  }

  // Simple hash function for privacy (IP and User-Agent)
  hashForPrivacy(data) {
    if (!data) return null;
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(data + process.env.HASH_SALT || 'molexa-salt').digest('hex').substring(0, 16);
  }

  // Track a new API request
  async trackRequest(req, res, responseTime) {
    if (!this.shouldTrackRequest(req.originalUrl, req.method)) {
      return; // Don't track this request
    }

    const requestData = {
      timestamp: new Date().toISOString(),
      method: req.method,
      endpoint: req.originalUrl,
      ip_hash: this.hashForPrivacy(req.ip || req.connection.remoteAddress),
      user_agent_hash: this.hashForPrivacy(req.get('User-Agent')),
      request_type: this.categorizeRequest(req.originalUrl),
      response_status: res.statusCode,
      response_time_ms: responseTime,
      month_year: this.currentMonth
    };

    // Update cache immediately
    this.cache.totalRequests++;
    this.cache.recentRequests.unshift(requestData);
    if (this.cache.recentRequests.length > 50) {
      this.cache.recentRequests = this.cache.recentRequests.slice(0, 50);
    }

    // Update counters
    this.cache.requestsByType[requestData.request_type] = 
      (this.cache.requestsByType[requestData.request_type] || 0) + 1;
    
    const endpointCategory = this.getEndpointCategory(requestData.endpoint);
    this.cache.requestsByEndpoint[endpointCategory] = 
      (this.cache.requestsByEndpoint[endpointCategory] || 0) + 1;

    // Store in database (async, don't block response)
    if (supabase) {
      this.storeRequestInDB(requestData).catch(error => {
        console.error('❌ Error storing request in database:', error);
      });
    }

    console.log(`📊 [${this.cache.totalRequests}] ${requestData.method} ${requestData.endpoint} - ${requestData.request_type} (${responseTime}ms)`);
  }

  async storeRequestInDB(requestData) {
    try {
      // Insert the request
      const { error } = await supabase
        .from('api_requests')
        .insert([requestData]);

      if (error) throw error;

      // Update monthly summary
      await this.updateMonthlySummary();
    } catch (error) {
      console.error('❌ Database storage error:', error);
    }
  }

  async updateMonthlySummary() {
    try {
      const { data: summary, error: fetchError } = await supabase
        .from('monthly_summaries')
        .select('*')
        .eq('month_year', this.currentMonth)
        .single();

      const summaryData = {
        month_year: this.currentMonth,
        total_requests: this.cache.totalRequests,
        requests_by_type: this.cache.requestsByType,
        requests_by_endpoint: this.cache.requestsByEndpoint,
        average_response_time: await this.calculateAverageResponseTime()
      };

      if (summary) {
        // Update existing summary
        const { error } = await supabase
          .from('monthly_summaries')
          .update(summaryData)
          .eq('month_year', this.currentMonth);
        
        if (error) throw error;
      } else {
        // Create new summary
        const { error } = await supabase
          .from('monthly_summaries')
          .insert([summaryData]);
        
        if (error) throw error;
      }
    } catch (error) {
      console.error('❌ Error updating monthly summary:', error);
    }
  }

  async calculateAverageResponseTime() {
    if (!supabase) return 0;
    
    try {
      const { data, error } = await supabase
        .from('api_requests')
        .select('response_time_ms')
        .eq('month_year', this.currentMonth)
        .not('response_time_ms', 'is', null);

      if (error) throw error;
      if (!data || data.length === 0) return 0;

      const total = data.reduce((sum, r) => sum + (r.response_time_ms || 0), 0);
      return Math.round(total / data.length);
    } catch (error) {
      console.error('❌ Error calculating average response time:', error);
      return 0;
    }
  }

  getEndpointCategory(url) {
    if (url.includes('/pubchem')) return 'PubChem API';
    if (url.includes('/pugview')) return 'Educational Content';
    if (url.includes('/autocomplete')) return 'Search Suggestions';
    return 'Other';
  }

  // Get current analytics summary
  getAnalyticsSummary() {
    return {
      totalRequests: this.cache.totalRequests,
      recentRequestsCount: this.cache.recentRequests.length,
      topEndpoints: Object.entries(this.cache.requestsByEndpoint)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5),
      topTypes: Object.entries(this.cache.requestsByType)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5),
      uptimeMinutes: Math.floor((new Date() - this.cache.startTime) / (1000 * 60)),
      currentMonth: this.currentMonth
    };
  }

  // Get recent requests for display
  getRecentRequests(limit = 20) {
    return this.cache.recentRequests.slice(0, limit);
  }

  // Monthly archival process
  async archiveMonth(monthYear) {
    if (!supabase) {
      console.log('📊 Skipping archival (no database configured)');
      return;
    }

    try {
      console.log(`📊 Starting archival for ${monthYear}...`);

      // Get all data for the month
      const { data: requests, error: requestsError } = await supabase
        .from('api_requests')
        .select('*')
        .eq('month_year', monthYear)
        .order('timestamp', { ascending: true });

      if (requestsError) throw requestsError;

      const { data: summary, error: summaryError } = await supabase
        .from('monthly_summaries')
        .select('*')
        .eq('month_year', monthYear)
        .single();

      if (summaryError) throw summaryError;

      // Create archive object
      const archiveData = {
        month_year: monthYear,
        summary: summary,
        requests: requests,
        archived_at: new Date().toISOString(),
        total_requests: requests.length
      };

      // Save to file
      const archiveDir = path.join(__dirname, '..', 'archives');
      await fs.mkdir(archiveDir, { recursive: true });
      
      const filename = path.join(archiveDir, `molexa-analytics-${monthYear}.json`);
      await fs.writeFile(filename, JSON.stringify(archiveData, null, 2));

      // Update summary to mark as archived
      await supabase
        .from('monthly_summaries')
        .update({ archived_at: new Date().toISOString() })
        .eq('month_year', monthYear);

      // Optionally delete old requests (keep summary)
      // Uncomment if you want to delete old data to save space
      /*
      await supabase
        .from('api_requests')
        .delete()
        .eq('month_year', monthYear);
      */

      console.log(`✅ Archived ${requests.length} requests for ${monthYear} to ${filename}`);
      return filename;
    } catch (error) {
      console.error(`❌ Error archiving month ${monthYear}:`, error);
      throw error;
    }
  }

  // Auto-archive previous month if it's a new month
  async checkAndArchivePreviousMonth() {
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthYear = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;

    if (previousMonthYear !== this.currentMonth) {
      try {
        await this.archiveMonth(previousMonthYear);
      } catch (error) {
        console.error('❌ Auto-archival failed:', error);
      }
    }
  }
}

// Export singleton instance
module.exports = new AnalyticsDB();