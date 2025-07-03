// api/index.js
// Clean API-only version - serves JSON endpoints only
// Static HTML is served separately by Vercel

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

// Initialize Express app
const app = express();

// Initialize caches
const cache = new NodeCache({ stdTTL: 86400 });
const autocompleteCache = new NodeCache({ stdTTL: 3600 });

// Analytics tracking
const analytics = {
  totalRequests: 0,
  recentRequests: [],
  requestsByEndpoint: {},
  requestsByHour: {},
  startTime: new Date()
};

// Store SSE connections
const sseConnections = new Set();

// CORS configuration for production
app.use(cors({
  origin: [
    'https://molexa.org',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    /^https:\/\/.*\.vercel\.app$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());
app.set('trust proxy', 1);

// Helper functions
function categorizeRequest(url) {
  if (url.includes('/educational')) return 'Educational Overview';
  if (url.includes('/safety')) return 'Safety Data';
  if (url.includes('/pharmacology')) return 'Pharmacology';
  if (url.includes('/properties')) return 'Properties';
  if (url.includes('/autocomplete')) return 'Autocomplete';
  if (url.includes('/pugview')) return 'Educational Annotations';
  if (url.includes('/compound/name/')) return 'Name Search';
  if (url.includes('/compound/cid/')) return 'CID Lookup';
  if (url.includes('/compound/formula/')) return 'Formula Search';
  if (url.includes('.PNG')) return 'Structure Image';
  if (url.includes('.SDF')) return 'Structure File';
  return 'Other';
}

function getEndpointCategory(url) {
  if (url.includes('/pubchem')) return 'PubChem API';
  if (url.includes('/pugview')) return 'Educational Content';
  if (url.includes('/autocomplete')) return 'Search Suggestions';
  if (url.includes('/docs')) return 'Documentation';
  if (url.includes('/health')) return 'Health Check';
  return 'Other';
}

function getAnalyticsSummary() {
  return {
    totalRequests: analytics.totalRequests,
    recentRequestsCount: analytics.recentRequests.length,
    topEndpoints: Object.entries(analytics.requestsByEndpoint)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5),
    uptimeMinutes: Math.floor((new Date() - analytics.startTime) / (1000 * 60)),
    requestsThisHour: analytics.requestsByHour[new Date().getHours()] || 0
  };
}

function broadcastToSSE(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  sseConnections.forEach(connection => {
    try {
      connection.write(message);
    } catch (error) {
      sseConnections.delete(connection);
    }
  });
}

// Analytics middleware
app.use('/api', (req, res, next) => {
  const requestData = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    method: req.method,
    endpoint: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    type: categorizeRequest(req.originalUrl)
  };

  analytics.totalRequests++;
  analytics.recentRequests.unshift(requestData);
  
  if (analytics.recentRequests.length > 100) {
    analytics.recentRequests = analytics.recentRequests.slice(0, 100);
  }

  const endpointCategory = getEndpointCategory(req.originalUrl);
  analytics.requestsByEndpoint[endpointCategory] = (analytics.requestsByEndpoint[endpointCategory] || 0) + 1;

  const hour = new Date().getHours();
  analytics.requestsByHour[hour] = (analytics.requestsByHour[hour] || 0) + 1;

  console.log(`📊 [${analytics.totalRequests}] ${req.method} ${req.originalUrl} - ${requestData.type}`);

  broadcastToSSE({
    type: 'new_request',
    data: requestData,
    analytics: getAnalyticsSummary()
  });

  next();
});

// Rate limiting
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

// ===== API ROUTES (JSON ONLY) =====

// Root API info endpoint
app.get('/api', (req, res) => {
  res.json({
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    description: 'Enhanced proxy server for educational molecular data access',
    documentation: {
      homepage: 'https://molexa.org/',
      interactive: 'https://molexa.org/#endpoints',
      json: '/api/docs'
    },
    base_url: 'https://molexa.org/api',
    status: 'online',
    uptime_minutes: Math.floor((new Date() - analytics.startTime) / (1000 * 60))
  });
});

// API Documentation (JSON only - HTML is served statically)
app.get('/api/docs', (req, res) => {
  res.json({
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    description: 'Enhanced proxy server for educational molecular data access',
    base_url: 'https://molexa.org/api',
    documentation_url: 'https://molexa.org/',
    endpoints: {
      health: 'GET /api/health - Service health check',
      analytics: 'GET /api/analytics - Analytics data',
      analytics_stream: 'GET /api/analytics/stream - Real-time SSE stream',
      pubchem: 'GET /api/pubchem/* - PubChem proxy',
      educational: 'GET /api/pubchem/compound/{id}/educational',
      safety: 'GET /api/pugview/compound/{cid}/safety',
      autocomplete: 'GET /api/autocomplete/{query}'
    },
    examples: {
      educational: '/api/pubchem/compound/caffeine/educational?type=name',
      safety: '/api/pugview/compound/2244/safety?heading=Toxicity',
      autocomplete: '/api/autocomplete/caffe?limit=5',
      properties: '/api/pubchem/compound/cid/2244/property/MolecularFormula,MolecularWeight/JSON'
    }
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    base_url: 'https://molexa.org/api',
    frontend_url: 'https://molexa.org/',
    analytics: getAnalyticsSummary(),
    features: [
      'PUG-REST API (computed properties)',
      'PUG-View API (educational annotations)',
      'Autocomplete suggestions',
      'Enhanced educational endpoints',
      'Live analytics dashboard'
    ]
  });
});

// Analytics endpoint
app.get('/api/analytics', (req, res) => {
  res.json({
    ...getAnalyticsSummary(),
    recentRequests: analytics.recentRequests.slice(0, 20),
    requestsByEndpoint: analytics.requestsByEndpoint,
    requestsByHour: analytics.requestsByHour,
    startTime: analytics.startTime
  });
});

// Analytics stream (SSE)
app.get('/api/analytics/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.write(`data: ${JSON.stringify({
    type: 'initial',
    analytics: getAnalyticsSummary(),
    recentRequests: analytics.recentRequests.slice(0, 10)
  })}\n\n`);

  sseConnections.add(res);

  req.on('close', () => {
    sseConnections.delete(res);
  });
});

// Dashboard redirect (since HTML is served statically)
app.get('/api/dashboard', (req, res) => {
  res.redirect('/#analytics');
});

// Educational endpoint
app.get('/api/pubchem/compound/:identifier/educational', async (req, res) => {
  try {
    const { identifier } = req.params;
    const identifierType = req.query.type || 'cid';
    
    const cacheKey = `educational:${identifierType}:${identifier}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      res.set('X-Cache', 'HIT');
      return res.json(cachedData);
    }

    let cid = identifier;
    if (identifierType !== 'cid') {
      const encodedIdentifier = encodeURIComponent(identifier.toLowerCase().trim());
      const cidResponse = await fetchFromPubChem(`compound/${identifierType}/${encodedIdentifier}/cids/JSON`);
      
      if (cidResponse.IdentifierList && cidResponse.IdentifierList.CID) {
        cid = cidResponse.IdentifierList.CID[0];
      } else {
        return res.status(404).json({
          error: 'Compound not found',
          message: `No compound found for "${identifier}" using ${identifierType} search`
        });
      }
    }

    const properties = ['MolecularWeight', 'HBondDonorCount', 'HBondAcceptorCount', 'XLogP', 'TPSA'].join(',');
    const basicData = await fetchFromPubChem(`compound/cid/${cid}/property/${properties}/JSON`);
    const synonymsData = await fetchFromPubChem(`compound/cid/${cid}/synonyms/JSON`);

    const educationalData = {
      cid: parseInt(cid),
      search_info: {
        original_identifier: identifier,
        identifier_type: identifierType
      },
      basic_properties: basicData.PropertyTable?.Properties?.[0] || {},
      synonyms: synonymsData.InformationList?.Information?.[0]?.Synonym?.slice(0, 10) || [],
      image_urls: {
        '2d_structure': `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG`,
        '3d_ball_stick': `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?record_type=3d`
      },
      urls: {
        pubchem_page: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
        sdf_download: `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/SDF`
      }
    };

    cache.set(cacheKey, educationalData);
    res.set('X-Cache', 'MISS');
    res.json(educationalData);

  } catch (error) {
    console.error('❌ Educational data error:', error);
    res.status(500).json({
      error: 'Failed to fetch educational data',
      message: error.message
    });
  }
});

// Autocomplete endpoint
app.get('/api/autocomplete/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const limit = req.query.limit || 10;
    
    const cacheKey = `autocomplete:${query}:${limit}`;
    const cachedData = autocompleteCache.get(cacheKey);
    
    if (cachedData) {
      res.set('X-Cache', 'HIT');
      return res.json(cachedData);
    }

    const autocompleteUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/Compound/${encodeURIComponent(query)}/json?limit=${limit}`;
    
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

// PUG-View endpoint
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
      res.set('X-Cache', 'HIT');
      return res.json(cachedData);
    }

    const pugViewUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/${pugViewPath}`;
    
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
          message: `No educational annotations found for compound ${cid}`
        });
      }
      throw new Error(`PUG-View error: ${response.status}`);
    }

    const data = await response.json();
    
    cache.set(cacheKey, data);
    res.set('X-Cache', 'MISS');
    res.json(data);

  } catch (error) {
    console.error('❌ PUG-View error:', error);
    res.status(500).json({
      error: 'Failed to fetch educational annotations',
      message: error.message
    });
  }
});

// PubChem proxy
app.get('/api/pubchem/*', async (req, res) => {
  try {
    const pubchemPath = req.params[0];
    const queryParams = new URLSearchParams(req.query).toString();
    const fullPath = queryParams ? `${pubchemPath}?${queryParams}` : pubchemPath;
    
    const cacheKey = `pubchem:${fullPath}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      res.set('X-Cache', 'HIT');
      res.set('Content-Type', cachedData.contentType);
      return res.send(cachedData.data);
    }

    const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/${fullPath}`;
    await new Promise(resolve => setTimeout(resolve, 200));

    const response = await fetch(pubchemUrl, {
      headers: {
        'User-Agent': 'MoleculeStudio/1.0 (Educational Research Tool)',
        'Accept': '*/*'
      },
      timeout: 30000
    });

    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({
          error: 'Compound not found',
          message: 'The requested compound was not found in PubChem database.'
        });
      }
      throw new Error(`PubChem API error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'application/json';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    cache.set(cacheKey, { data, contentType });
    res.set('Content-Type', contentType);
    res.set('X-Cache', 'MISS');
    res.send(data);

  } catch (error) {
    console.error('❌ Proxy error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while processing your request.'
    });
  }
});

// 404 handler for API routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    message: `Route ${req.originalUrl} not found`,
    available_endpoints: {
      health: '/api/health',
      docs: '/api/docs',
      analytics: '/api/analytics',
      educational: '/api/pubchem/compound/{id}/educational',
      autocomplete: '/api/autocomplete/{query}',
      pubchem_proxy: '/api/pubchem/*'
    },
    frontend_url: 'https://molexa.org/'
  });
});

// Helper functions
async function fetchFromPubChem(path) {
  const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/${path}`;
  await new Promise(resolve => setTimeout(resolve, 200));
  
  const response = await fetch(pubchemUrl, {
    headers: {
      'User-Agent': 'MoleculeStudio/1.0 (Educational Research Tool)',
      'Accept': 'application/json'
    },
    timeout: 30000
  });

  if (!response.ok) {
    throw new Error(`PubChem API error: ${response.status}`);
  }

  return await response.json();
}

// Export the Express app as a serverless function
module.exports = app;