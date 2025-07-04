// Enhanced PubChem Backend Proxy Server for Educational Applications
// Updated with selective analytics tracking and database storage

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3001;
// Initialize caches
const cache = new NodeCache({ stdTTL: 86400 });
const autocompleteCache = new NodeCache({ stdTTL: 3600 });

// 📊 NEW: Initialize Analytics Database System
let analyticsDB;
try {
  // Try to load the analytics database system
  analyticsDB = require('./analytics-db');
  console.log('📊 Analytics database system loaded');
} catch (error) {
  console.log('📊 Analytics database not configured, using memory-only analytics');
  // Fallback to simple memory-based analytics
  analyticsDB = {
    shouldTrackRequest: () => false, // Don't track anything without DB
    trackRequest: async () => {},
    getAnalyticsSummary: () => ({
      totalRequests: 0,
      recentRequestsCount: 0,
      topEndpoints: [],
      topTypes: [],
      uptimeMinutes: 0,
      currentMonth: new Date().toISOString().slice(0, 7)
    }),
    getRecentRequests: () => []
  };
}

// Enable CORS for all routes
app.use(cors({
  origin: [
    'https://molexa.org',
    'https://molexa.vercel.app',   // Vercel preview/live
    'https://molexa-api.vercel.app',
    'https://www.molexa.org',
    'http://localhost:3000', 
    'http://localhost:5173', 
    'http://127.0.0.1:5173',
    /^https:\/\/.*\.vercel\.app$/
  ],
  credentials: true
}));

app.use(express.json());

// Static file serving
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/static', express.static(path.join(__dirname, '..', 'public')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// 📊 NEW: Selective Analytics Middleware - Only tracks actual API usage
const analyticsMiddleware = (req, res, next) => {
  // Only proceed if this is a trackable request
  if (!analyticsDB.shouldTrackRequest(req.originalUrl, req.method)) {
    return next();
  }

  const startTime = Date.now();

  // Track the request when response finishes
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    
    // Track the request (async, don't block response)
    analyticsDB.trackRequest(req, res, responseTime)
      .catch(error => console.error('❌ Analytics tracking error:', error));
    
    // Call original send
    return originalSend.call(this, data);
  };

  next();
};

// Apply analytics middleware to all routes (it will self-filter)
app.use(analyticsMiddleware);

// Rate limiting (excluding analytics and static routes)
const limiter = rateLimit({
  windowMs: 1000,
  max: 5,
  message: {
    error: 'Too many requests. PubChem allows maximum 5 requests per second.',
    retryAfter: 1
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/pubchem', limiter);
app.use('/api/pugview', limiter);
app.use('/api/autocomplete', limiter);


// These routes will now serve the updated index.html - no changes needed
app.get('/', (req, res) => {
  try {
    const indexPath = path.join(__dirname, '..', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.redirect('/api/docs');
    }
  } catch (error) {
    console.error('Error serving root:', error);
    res.redirect('/api/docs');
  }
});

app.get('/api', (req, res) => {
  try {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.send(generateMainDocsPage());
    }
  } catch (error) {
    console.error('Error serving API root:', error);
    res.send(generateMainDocsPage());
  }
});

app.get('/api/docs', (req, res) => {
  try {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      console.log('📄 Serving index.html for /api/docs');
      res.sendFile(indexPath);
    } else {
      console.log('📄 Generating docs HTML for /api/docs');
      res.send(generateMainDocsPage());
    }
  } catch (error) {
    console.error('❌ Error serving documentation:', error);
    res.send(generateMainDocsPage());
  }
});


// 📊 IMPROVED: Analytics endpoints with better error handling
// 📊 FIXED: Analytics endpoints with actual database totals
app.get('/api/analytics', async (req, res) => {
  try {
    console.log('📊 Analytics endpoint called');
    
    // FIXED: Get actual totals from database
    const totalRequests = await analyticsDB.getTotalRequestsFromDB();
    const metricsFromDB = await analyticsDB.getMetricsFromDB();
    
    // Get fresh recent requests (50 requests for activity feed)
    const recentRequests = await analyticsDB.getRecentRequestsFromDB(50);
    
    console.log(`📊 Database totals: ${totalRequests} total, Educational: ${metricsFromDB.educational}, Safety: ${metricsFromDB.safety}, Search: ${metricsFromDB.search}`);
    
    // Build summary with database totals
    const summary = analyticsDB.getAnalyticsSummary();
    const responseData = {
      ...summary,
      totalRequests: totalRequests, // FIXED: Use database total
      recentRequests: recentRequests,
      metrics: metricsFromDB, // FIXED: Use database metrics
      database_connected: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      tracking_mode: analyticsDB.shouldTrackRequest ? 'selective' : 'disabled',
      environment: process.env.NODE_ENV || 'development',
      debug_info: {
        cache_total: summary.totalRequests,
        db_total: totalRequests,
        db_requests_count: recentRequests.length,
        supabase_configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
      }
    };
    
    console.log('📊 Sending analytics response with database totals');
    
    res.json(responseData);
  } catch (error) {
    console.error('❌ Analytics endpoint error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch analytics',
      message: error.message,
      debug: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 📊 UPDATED: Server-Sent Events for real-time updates (every 30 seconds, 50 requests)
// 📊 FIXED: Server-Sent Events with database totals (every 30 seconds)
app.get('/api/analytics/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send analytics update with database totals
  const sendAnalyticsUpdate = async () => {
    try {
      // FIXED: Get actual totals from database every 30 seconds
      const totalRequests = await analyticsDB.getTotalRequestsFromDB();
      const metricsFromDB = await analyticsDB.getMetricsFromDB();
      const recentRequests = await analyticsDB.getRecentRequestsFromDB(50);
      
      const summary = analyticsDB.getAnalyticsSummary();
      
      res.write(`data: ${JSON.stringify({
        type: 'update',
        analytics: {
          ...summary,
          totalRequests: totalRequests // FIXED: Use database total
        },
        recentRequests: recentRequests,
        metrics: metricsFromDB // FIXED: Use database metrics
      })}\n\n`);
      
      console.log(`📊 SSE Update: ${totalRequests} total, Educational: ${metricsFromDB.educational}, Safety: ${metricsFromDB.safety}`);
    } catch (error) {
      console.error('❌ SSE analytics error:', error);
    }
  };

  // Send initial data immediately
  sendAnalyticsUpdate();

  // FIXED: Send updates every 30 seconds with fresh database totals
  const interval = setInterval(() => {
    sendAnalyticsUpdate();
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
  });

  req.on('error', () => {
    clearInterval(interval);
  });
});

// NEW: Monthly analytics reports
app.get('/api/analytics/monthly/:monthYear?', async (req, res) => {
  try {
    const monthYear = req.params.monthYear || new Date().toISOString().slice(0, 7);
    
    if (!process.env.SUPABASE_URL) {
      return res.status(503).json({ 
        error: 'Database not configured',
        message: 'Monthly reports require database connection'
      });
    }

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

    const { data: summary, error } = await supabase
      .from('monthly_summaries')
      .select('*')
      .eq('month_year', monthYear)
      .single();

    if (error) {
      return res.status(404).json({ 
        error: 'Month not found',
        message: `No data available for ${monthYear}`
      });
    }

    res.json(summary);
  } catch (error) {
    console.error('❌ Monthly analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly analytics' });
  }
});

// NEW: Archive endpoint (admin only)
app.post('/api/analytics/archive/:monthYear', async (req, res) => {
  // Add authentication here in production
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { monthYear } = req.params;
    
    if (!analyticsDB.archiveMonth) {
      return res.status(503).json({ 
        error: 'Archive not available',
        message: 'Database analytics required for archival'
      });
    }

    const filename = await analyticsDB.archiveMonth(monthYear);
    
    res.json({ 
      success: true, 
      message: `Month ${monthYear} archived successfully`,
      filename: filename
    });
  } catch (error) {
    console.error('❌ Archive error:', error);
    res.status(500).json({ error: 'Archive failed', message: error.message });
  }
});

// 📊 UPDATED: Server-Sent Events for real-time updates
app.get('/api/analytics/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial data (mapped for frontend)
  const summary = analyticsDB.getAnalyticsSummary();
  const recentRequests = analyticsDB.getRecentRequests(10);
  const mappedRecentRequests = recentRequests.map(r => ({
    ...r,
    type: r.request_type || r.type || 'API Request'
  }));
  
  res.write(`data: ${JSON.stringify({
    type: 'initial',
    analytics: summary,
    recentRequests: mappedRecentRequests
  })}\n\n`);

  

  // Send updates every 30 seconds
  const interval = setInterval(() => {
    try {
      const currentSummary = analyticsDB.getAnalyticsSummary();
      const currentRequests = analyticsDB.getRecentRequests(5);
      const mappedCurrentRequests = currentRequests.map(r => ({
        ...r,
        type: r.request_type || r.type || 'API Request'
      }));
      
      res.write(`data: ${JSON.stringify({
        type: 'update',
        analytics: currentSummary,
        recentRequests: mappedCurrentRequests
      })}\n\n`);
    } catch (error) {
      clearInterval(interval);
    }
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// DEBUG: Analytics debug endpoint (remove in production)
app.get('/api/debug/analytics', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Debug endpoint only available in development' });
  }
  
  try {
    const debug = {
      environment: process.env.NODE_ENV,
      supabase_configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      supabase_url_exists: !!process.env.SUPABASE_URL,
      supabase_key_exists: !!process.env.SUPABASE_ANON_KEY,
      analytics_db_available: !!analyticsDB,
      cache_state: analyticsDB.cache || {},
      current_month: analyticsDB.currentMonth || null
    };
    
    // Test database connection
    if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const testSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        const { data, error } = await testSupabase
          .from('api_requests')
          .select('count', { count: 'exact' })
          .limit(1);
        
        debug.supabase_test = {
          success: !error,
          error: error?.message || null,
          count: data?.length || 0
        };
      } catch (err) {
        debug.supabase_test = {
          success: false,
          error: err.message
        };
      }
    }
    
    res.json(debug);
  } catch (error) {
    res.status(500).json({
      error: 'Debug failed',
      message: error.message
    });
  }
});

// Health check endpoint (enhanced with analytics)
app.get('/api/health', (req, res) => {
  const analyticsStatus = analyticsDB.getAnalyticsSummary();
  
  res.json({ 
    status: 'healthy', 
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    base_url: 'https://molexa-api.vercel.app',
    cache_stats: cache.getStats(),
    analytics: {
      ...analyticsStatus,
      database_connected: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
      tracking_enabled: !!analyticsDB.shouldTrackRequest
    },
    features: [
      'PUG-REST API (computed properties)',
      'PUG-View API (educational annotations)', 
      'Autocomplete suggestions',
      'Enhanced educational endpoints',
      'Selective analytics tracking',
      'Database-backed analytics storage'
    ]
  });
});

// JSON API documentation
app.get('/api/json/docs', (req, res) => {
  res.json({
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    description: 'Enhanced proxy server for educational molecular data access with selective analytics',
    base_url: 'https://molexa-api.vercel.app/api',
    homepage: 'https://molexa.org',
    documentation: 'https://molexa-api.vercel.app/api/docs',
    endpoints: {
      health: 'GET /api/health - Service health check with analytics',
      docs: 'GET /api/docs - Interactive documentation',
      docs_json: 'GET /api/json/docs - This JSON documentation',
      analytics: 'GET /api/analytics - Analytics data (JSON)',
      analytics_monthly: 'GET /api/analytics/monthly/{month} - Monthly analytics report',
      analytics_stream: 'GET /api/analytics/stream - Real-time SSE stream',
      analytics_archive: 'POST /api/analytics/archive/{month} - Archive monthly data (admin)',
      dashboard: 'GET /api/dashboard - Live analytics dashboard',
      pubchem: 'GET /api/pubchem/* - Proxy PubChem REST API calls',
      educational: 'GET /api/pubchem/compound/{id}/educational - Comprehensive educational data',
      pugview: 'GET /api/pugview/compound/{cid}/{section} - Educational annotations',
      autocomplete: 'GET /api/autocomplete/{query} - Chemical name suggestions',
      headings: 'GET /api/pugview/headings/{topic} - Available educational headings'
    },
    examples: {
      search_by_name: '/api/pubchem/compound/name/aspirin/cids/JSON',
      get_properties: '/api/pubchem/compound/cid/2244/property/MolecularFormula,MolecularWeight/JSON',
      get_sdf: '/api/pubchem/compound/cid/2244/SDF',
      get_image: '/api/pubchem/compound/cid/2244/PNG',
      educational_data: '/api/pubchem/compound/caffeine/educational?type=name',
      safety_info: '/api/pugview/compound/2244/safety?heading=Toxicity',
      autocomplete: '/api/autocomplete/caffe?limit=5'
    },
    features: [
      'Selective analytics tracking (only real API usage)',
      'Database-backed persistent analytics storage',
      'Monthly data archival and reporting',
      'Privacy-protected analytics (hashed IPs)',
      'Real-time usage statistics via Server-Sent Events',
      'Educational impact tracking and visualization'
    ]
  });
});

// Enhanced compound data endpoint with educational properties
// 🔧 FIXED: Updated to use fastformula instead of deprecated formula endpoint
// Enhanced compound data endpoint with educational properties
// 🔧 FIXED: Updated to properly handle fastformula endpoint
// Fixed educational endpoint - resolves encodedIdentifier scope issue
app.get('/api/pubchem/compound/:identifier/educational', async (req, res) => {
  try {
    const { identifier } = req.params;
    const identifierType = req.query.type || 'cid';
    
    const cacheKey = `educational:${identifierType}:${identifier}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log(`📦 Cache hit for educational data: ${identifier}`);
      res.set('X-Cache', 'HIT');
      return res.json(cachedData);
    }

    console.log(`🎓 Fetching educational data for: ${identifier} (type: ${identifierType})`);
    
    let cid = identifier;
    let encodedIdentifier = identifier; // 🔧 FIX: Declare outside the if block
    
    if (identifierType !== 'cid') {
      encodedIdentifier = encodeURIComponent(identifier.toLowerCase().trim());
      console.log(`🔍 Searching for CID using ${identifierType}: ${encodedIdentifier}`);
      
      // Use the identifierType directly - fastformula is already the correct endpoint
      let pubchemSearchType = identifierType;
      console.log(`🌐 Using PubChem endpoint: compound/${pubchemSearchType}/${encodedIdentifier}/cids/JSON`);
      
      const cidResponse = await fetchFromPubChem(`compound/${pubchemSearchType}/${encodedIdentifier}/cids/JSON`);
      if (cidResponse.IdentifierList && cidResponse.IdentifierList.CID) {
        cid = cidResponse.IdentifierList.CID[0];
        console.log(`✅ Found CID: ${cid} for ${identifier} using ${pubchemSearchType}`);
      } else {
        return res.status(404).json({ 
          error: 'Compound not found',
          message: `No compound found for "${identifier}" using ${identifierType} search`,
          suggestions: [
            'Check the spelling of the compound name',
            'Try alternative names (e.g., "acetylsalicylic acid" for aspirin)',
            'Use a different identifier type (name, fastformula, smiles)',
            'For formulas, ensure proper capitalization (e.g., C2H6O not c2h6o)',
            'Search on PubChem website first to verify the compound exists'
          ]
        });
      }
    }

    // Fetch comprehensive properties
    const properties = [
      'MolecularWeight',
      'HBondDonorCount',
      'HBondAcceptorCount',
      'HeavyAtomCount',
      'XLogP',
      'TPSA'
    ].join(',');
    
    console.log(`🧪 Fetching properties for CID: ${cid}`);
    const basicData = await fetchFromPubChem(`compound/cid/${cid}/property/${properties}/JSON`);
    
    console.log(`📚 Fetching synonyms for CID: ${cid}`);
    const synonymsData = await fetchFromPubChem(`compound/cid/${cid}/synonyms/JSON`);
    
    let conformerData = null;
    try {
      console.log(`🔬 Fetching 3D conformer data for CID: ${cid}`);
      conformerData = await fetchFromPubChem(`compound/cid/${cid}/conformers/JSON?conformers_type=3d`);
    } catch (e) {
      console.log(`ℹ️  No 3D conformer data available for CID ${cid}`);
    }

    // Compile educational data
    const educationalData = {
      cid: parseInt(cid),
      search_info: {
        original_identifier: identifier,
        identifier_type: identifierType,
        found_via: identifierType !== 'cid' ? `${identifierType} search` : 'direct CID',
        search_successful: true,
        pubchem_endpoint_used: identifierType !== 'cid' ? `compound/${identifierType}/${encodedIdentifier}/cids/JSON` : 'direct CID'
      },
      basic_properties: basicData.PropertyTable?.Properties?.[0] || {},
      synonyms: synonymsData.InformationList?.Information?.[0]?.Synonym?.slice(0, 10) || [],
      structure_3d: conformerData?.PC_Compounds?.[0] || null,
      image_urls: {
        '2d_structure': `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG`,
        '3d_ball_stick': `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?record_type=3d`,
        'large_2d': `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=large`
      },
      urls: {
        pubchem_page: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
        sdf_download: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF`,
        mol_download: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF/?record_type=3d&response_type=save&response_basename=compound_${cid}`
      },
      educational_sections: [
        'Chemical and Physical Properties',
        'Safety and Hazards', 
        'Pharmacology and Biochemistry',
        'Use and Manufacturing',
        'Environmental Fate',
        'Literature References'
      ]
    };

    if (educationalData.basic_properties) {
      educationalData.educational_context = addEducationalContext([educationalData.basic_properties]);
    }

    cache.set(cacheKey, educationalData);
    
    res.set('X-Cache', 'MISS');
    res.json(educationalData);

  } catch (error) {
    console.error('❌ Educational data error:', error);
    
    if (error.message.includes('PubChem API error: 400')) {
      res.status(400).json({
        error: 'Invalid compound search',
        message: `PubChem could not find compound "${req.params.identifier}" using ${req.query.type || 'cid'} search`,
        suggestions: [
          'Verify the compound name spelling',
          'Try searching on PubChem website first',
          'Use alternative compound names or identifiers',
          'For molecular formulas, ensure proper case (C2H6O not c2h6o)',
          'Check if the compound exists in PubChem database'
        ],
        pubchem_error: error.message
      });
    } else if (error.message.includes('PubChem API error: 404')) {
      res.status(404).json({
        error: 'Compound not found',
        message: `Compound "${req.params.identifier}" not found in PubChem`,
        suggestions: [
          'Check spelling and try alternative names',
          'Use chemical identifiers like SMILES or InChI',
          'For formulas, try the fastformula search endpoint',
          'Search PubChem website to verify compound exists'
        ]
      });
    } else {
      res.status(500).json({
        error: 'Failed to fetch educational data',
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
});

// PUG-View endpoint for detailed educational annotations
app.get('/api/pugview/compound/:cid/:section?', async (req, res) => {
  try {
    const { cid, section } = req.params;
    const heading = req.query.heading;
    
    let pugViewPath = `data/compound/${cid}/JSON`;
    if (heading) {
      pugViewPath += `?heading=${encodeURIComponent(heading)}`;
    }
    
    const cacheKey = `pugview:${cid}:${section || 'all'}:${heading || 'none'}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log(`📦 Cache hit for PUG-View: ${cid}/${section || 'all'}`);
      res.set('X-Cache', 'HIT');
      return res.json(cachedData);
    }

    const pugViewUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/${pugViewPath}`;
    console.log(`📚 Fetching PUG-View data: ${pugViewUrl}`);

    await new Promise(resolve => setTimeout(resolve, 200));

    const response = await fetch(pugViewUrl, {
      headers: {
        'User-Agent': 'MoleculeStudio/1.0 (Educational Research Tool)',
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({
          error: 'Educational content not found',
          message: `No educational annotations found for compound ${cid}${heading ? ` under heading "${heading}"` : ''}`,
          suggestions: [
            'Try a different compound with more available data',
            'Check available headings using the /api/pugview/headings endpoint',
            'This compound may have limited educational annotations'
          ]
        });
      }
      throw new Error(`PUG-View error: ${response.status}`);
    }

    const data = await response.json();
    
    let educationalContent = data;
    
    if (section === 'safety') {
      educationalContent = extractSafetyData(data);
    } else if (section === 'pharmacology') {
      educationalContent = extractPharmacologyData(data);
    } else if (section === 'properties') {
      educationalContent = extractPropertiesData(data);
    }

    cache.set(cacheKey, educationalContent);
    
    res.set('X-Cache', 'MISS');
    res.set('X-PugView-URL', pugViewUrl);
    res.json(educationalContent);

  } catch (error) {
    console.error('❌ PUG-View error:', error);
    res.status(500).json({
      error: 'Failed to fetch educational annotations',
      message: error.message
    });
  }
});

// Autocomplete endpoint for chemical name suggestions
app.get('/api/autocomplete/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const limit = req.query.limit || 10;
    
    const cacheKey = `autocomplete:${query}:${limit}`;
    const cachedData = autocompleteCache.get(cacheKey);
    
    if (cachedData) {
      console.log(`📦 Cache hit for autocomplete: ${query}`);
      res.set('X-Cache', 'HIT');
      return res.json(cachedData);
    }

    const autocompleteUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/Compound/${encodeURIComponent(query)}/json?limit=${limit}`;
    console.log(`🔍 Fetching autocomplete: ${autocompleteUrl}`);

    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await fetch(autocompleteUrl, {
      headers: {
        'User-Agent': 'MoleculeStudio/1.0 (Educational Research Tool)',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`Autocomplete error: ${response.status}`);
    }

    const data = await response.json();
    
    const suggestions = {
      query: query,
      total: data.total || 0,
      suggestions: data.dictionary_terms?.compound || []
    };

    autocompleteCache.set(cacheKey, suggestions);
    
    res.set('X-Cache', 'MISS');
    res.json(suggestions);

  } catch (error) {
    console.error('❌ Autocomplete error:', error);
    res.status(500).json({
      error: 'Failed to fetch suggestions',
      message: error.message
    });
  }
});

// Get available educational headings
app.get('/api/pugview/headings/:topic?', async (req, res) => {
  try {
    const { topic } = req.params;
    
    const educationalHeadings = {
      safety: [
        'Safety and Hazards',
        'Toxicity',
        'First Aid Measures', 
        'Fire Fighting Measures',
        'Accidental Release Measures',
        'Handling and Storage',
        'Exposure Controls',
        'GHS Classification'
      ],
      pharmacology: [
        'Pharmacology and Biochemistry',
        'Mechanism of Action',
        'Pharmacokinetics',
        'Therapeutic Uses',
        'Drug Interactions',
        'Contraindications',
        'Dosage Forms',
        'Clinical Trials'
      ],
      properties: [
        'Chemical and Physical Properties',
        'Density',
        'Boiling Point',
        'Melting Point', 
        'Solubility',
        'Viscosity',
        'Vapor Pressure',
        'Stability/Shelf Life',
        'Decomposition',
        'pH',
        'Odor',
        'Color/Form'
      ]
    };

    if (topic && educationalHeadings[topic]) {
      res.json({
        topic: topic,
        headings: educationalHeadings[topic]
      });
    } else {
      res.json({
        all_topics: Object.keys(educationalHeadings),
        headings_by_topic: educationalHeadings
      });
    }

  } catch (error) {
    console.error('❌ Headings error:', error);
    res.status(500).json({
      error: 'Failed to get headings',
      message: error.message
    });
  }
});

// Main PubChem proxy endpoint
app.get('/api/pubchem/*', async (req, res) => {
  try {
    const pubchemPath = req.params[0];
    const queryParams = new URLSearchParams(req.query).toString();
    const fullPath = queryParams ? `${pubchemPath}?${queryParams}` : pubchemPath;
    
    const cacheKey = `pubchem:${fullPath}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log(`📦 Cache hit for: ${fullPath}`);
      res.set('X-Cache', 'HIT');
      res.set('Content-Type', cachedData.contentType);
      return res.send(cachedData.data);
    }

    const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/${fullPath}`;
    console.log(`🔍 Fetching from PubChem: ${pubchemUrl}`);

    await new Promise(resolve => setTimeout(resolve, 200));

    const response = await fetch(pubchemUrl, {
      headers: {
        'User-Agent': 'MoleculeStudio/1.0 (Educational Research Tool)',
        'Accept': '*/*'
      },
      timeout: 30000
    });

    if (response.status === 503) {
      return res.status(503).json({
        error: 'PubChem service temporarily unavailable',
        message: 'PubChem is experiencing high traffic. Please try again in a few seconds.',
        retryAfter: 10
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ PubChem error ${response.status}: ${errorText}`);
      
      if (response.status === 404) {
        return res.status(404).json({
          error: 'Compound not found',
          message: 'The requested compound was not found in PubChem database.',
          suggestions: [
            'Check spelling of the compound name',
            'Try alternative names (e.g., "acetylsalicylic acid" for aspirin)',
            'Use chemical identifiers like SMILES or InChI'
          ]
        });
      }

      return res.status(response.status).json({
        error: 'PubChem API error',
        status: response.status,
        message: errorText || 'Unknown error occurred'
      });
    }

    const contentType = response.headers.get('content-type') || 'application/json';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (fullPath.includes('/property/') && data.PropertyTable) {
      data.educational_context = addEducationalContext(data.PropertyTable.Properties);
    }

    cache.set(cacheKey, { data, contentType });
    console.log(`💾 Cached response for: ${fullPath}`);

    res.set('Content-Type', contentType);
    res.set('X-Cache', 'MISS');
    res.set('X-PubChem-URL', pubchemUrl);
    
    res.send(data);

  } catch (error) {
    console.error('❌ Proxy error:', error);
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Network error',
        message: 'Unable to connect to PubChem. Please check your internet connection.',
        code: error.code
      });
    }

    if (error.name === 'FetchError' && error.message.includes('timeout')) {
      return res.status(504).json({
        error: 'Request timeout',
        message: 'PubChem request timed out. The service may be overloaded.',
        retryAfter: 30
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your request.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper functions
async function fetchFromPubChem(path) {
  const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/${path}`;
  console.log(`🌐 PubChem API call: ${pubchemUrl}`);
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const response = await fetch(pubchemUrl, {
    headers: {
      'User-Agent': 'MoleculeStudio/1.0 (Educational Research Tool)',
      'Accept': 'application/json'
    },
    timeout: 30000
  });

  if (!response.ok) {
    let errorDetails = '';
    try {
      const errorText = await response.text();
      console.error(`❌ PubChem error response: ${errorText}`);
      errorDetails = errorText;
    } catch (e) {
      errorDetails = 'Unable to read error details';
    }
    
    throw new Error(`PubChem API error: ${response.status} - ${errorDetails}`);
  }

  const contentType = response.headers.get('content-type') || 'application/json';
  
  if (contentType.includes('application/json')) {
    return await response.json();
  } else {
    return await response.text();
  }
}

function extractSafetyData(data) {
  return data;
}

function extractPharmacologyData(data) {
  return data;
}

function extractPropertiesData(data) {
  return data;
}

function addEducationalContext(properties) {
  if (!properties || !Array.isArray(properties)) return null;
  
  return properties.map(prop => {
    const context = {};
    
    if (prop.MolecularWeight) {
      context.molecular_weight_info = "Molecular weight affects drug absorption, distribution, and elimination. Generally, drugs with MW 150-500 Da have optimal properties.";
    }
    
    if (prop.XLogP !== undefined) {
      context.xlogp_info = "XLogP measures lipophilicity. Values between 1-3 are often ideal for drug-like compounds. Higher values indicate more lipophilic (fat-loving) molecules.";
    }
    
    if (prop.TPSA) {
      context.tpsa_info = "Topological Polar Surface Area affects cell membrane permeability. TPSA < 140 Ų is often associated with good oral bioavailability.";
    }
    
    if (prop.HBondDonorCount !== undefined || prop.HBondAcceptorCount !== undefined) {
      context.hydrogen_bonding_info = "Hydrogen bonding affects solubility and biological activity. Lipinski's Rule suggests ≤5 donors and ≤10 acceptors for drug-like compounds.";
    }
    
    return { ...prop, educational_context: context };
  });
}

// 📊 Initialize analytics system on startup
async function initializeAnalytics() {
  console.log('📊 Initializing selective analytics system...');
  
  if (analyticsDB.initializeCache) {
    try {
      await analyticsDB.initializeCache();
      console.log('📊 Analytics cache initialized successfully');
    } catch (error) {
      console.error('❌ Analytics initialization error:', error);
    }
  }
  
  if (analyticsDB.checkAndArchivePreviousMonth) {
    try {
      await analyticsDB.checkAndArchivePreviousMonth();
    } catch (error) {
      console.error('❌ Auto-archival check failed:', error);
    }
  }
  
  // Set up monthly archival cron job (runs at 1 AM on the 1st of each month)
  if (process.env.NODE_ENV === 'production' && analyticsDB.checkAndArchivePreviousMonth) {
    try {
      const cron = require('node-cron');
      cron.schedule('0 1 1 * *', async () => {
        console.log('📊 Running monthly auto-archival...');
        await analyticsDB.checkAndArchivePreviousMonth();
      });
      console.log('📊 Monthly archival cron job scheduled');
    } catch (error) {
      console.log('📊 Cron not available, manual archival only');
    }
  }
}

function generateMainDocsPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>moleXa API - Fallback Documentation</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
</head>
<body>
    <div class="container mt-5">
        <div class="alert alert-info">
            <h4>moleXa Educational API</h4>
            <p>Fallback documentation page. The main documentation should be served from the static HTML file.</p>
            <a href="/api/health" class="btn btn-primary">API Health Check</a>
            <a href="/api/json/docs" class="btn btn-secondary">JSON Documentation</a>
        </div>
    </div>
</body>
</html>
  `;
}

// Initialize analytics on startup
initializeAnalytics().catch(console.error);


// start the server
app.listen(port, () => {
  console.log(`🚀 moleXa backend listening on http://localhost:${port}`);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: ['/health', '/api/docs', '/api/analytics', '/api/json/docs', '/api/pubchem/*']
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});


module.exports = app;