// analytics-db.js - Database-backed analytics system for moleXa API

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client (free tier: 500MB, 2 databases)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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
    console.log('📊 Initializing analytics cache from Supabase...');
    
    // Test connection first
    const { data: testData, error: testError } = await supabase
      .from('api_requests')
      .select('count', { count: 'exact' })
      .limit(1);
    
    if (testError) {
      console.error('❌ Supabase connection test failed:', testError);
      return;
    }
    
    console.log('✅ Supabase connection successful');

    // Get current month summary
    const { data: summary, error: summaryError } = await supabase
      .from('monthly_summaries')
      .select('*')
      .eq('month_year', this.currentMonth)
      .single();

    if (summaryError && summaryError.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('❌ Error fetching monthly summary:', summaryError);
    }

    if (summary) {
      console.log(`📊 Found summary for ${this.currentMonth}: ${summary.total_requests} requests`);
      this.cache.totalRequests = summary.total_requests || 0;
      this.cache.requestsByType = summary.requests_by_type || {};
      this.cache.requestsByEndpoint = summary.requests_by_endpoint || {};
    } else {
      console.log(`📊 No summary found for ${this.currentMonth}, starting fresh`);
      // Create initial summary if it doesn't exist
      await this.createInitialSummary();
    }

    // Get recent requests (last 50)
    const { data: recentRequests, error: requestsError } = await supabase
      .from('api_requests')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);

    if (requestsError) {
      console.error('❌ Error fetching recent requests:', requestsError);
    } else {
      this.cache.recentRequests = (recentRequests || []).map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        method: r.method,
        endpoint: r.endpoint,
        type: r.request_type,
        request_type: r.request_type
      }));
      console.log(`📊 Loaded ${this.cache.recentRequests.length} recent requests`);
    }

    console.log(`📊 Analytics cache initialized: ${this.cache.totalRequests} total requests`);
  } catch (error) {
    console.error('❌ Error initializing analytics cache:', error);
  }
}

// NEW: Create initial summary for current month
async createInitialSummary() {
  try {
    const { error } = await supabase
      .from('monthly_summaries')
      .insert([{
        month_year: this.currentMonth,
        total_requests: 0,
        requests_by_type: {},
        requests_by_endpoint: {},
        average_response_time: 0
      }]);
    
    if (error) {
      console.error('❌ Error creating initial summary:', error);
    } else {
      console.log(`📊 Created initial summary for ${this.currentMonth}`);
    }
  } catch (error) {
    console.error('❌ Error in createInitialSummary:', error);
  }
}

  // NEW: Get recent requests directly from database
  async getRecentRequestsFromDB(limit = 50) {
    if (!supabase) {
      return this.cache.recentRequests.slice(0, limit);
    }

    try {
      const { data: recentRequests, error } = await supabase
        .from('api_requests')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (recentRequests || []).map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        method: r.method,
        endpoint: r.endpoint,
        type: r.request_type,
        request_type: r.request_type,
        response_status: r.response_status,
        response_time_ms: r.response_time_ms
      }));
    } catch (error) {
      console.error('❌ Error fetching recent requests from database:', error);
      return this.cache.recentRequests.slice(0, limit);
    }
  }

  // NEW: Calculate metrics from recent requests
  calculateMetricsFromRequests(requests) {
    const metrics = {
      educational: 0,
      safety: 0,
      properties: 0,
      pharmacology: 0,
      search: 0,
      images: 0,
      total: requests.length
    };

    requests.forEach(request => {
      const type = (request.type || '').toLowerCase();
      const endpoint = (request.endpoint || '').toLowerCase();

      if (type.includes('educational') || endpoint.includes('educational')) {
        metrics.educational++;
      } else if (type.includes('safety') || endpoint.includes('safety')) {
        metrics.safety++;
      } else if (type.includes('properties') || endpoint.includes('properties')) {
        metrics.properties++;
      } else if (type.includes('pharmacology') || endpoint.includes('pharmacology')) {
        metrics.pharmacology++;
      } else if (type.includes('autocomplete') || type.includes('search') || endpoint.includes('autocomplete')) {
        metrics.search++;
      } else if (type.includes('image') || endpoint.includes('.png')) {
        metrics.images++;
      }
    });

    return metrics;
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
    const cacheEntry = {
      ...requestData,
      type: requestData.request_type
    };
    this.cache.recentRequests.unshift(cacheEntry);
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

  // Get recent requests for display (from cache)
  getRecentRequests(limit = 20) {
    return this.cache.recentRequests.slice(0, limit);
  }

  // Monthly archival and other methods remain the same...
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