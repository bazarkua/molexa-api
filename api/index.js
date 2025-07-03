// api/index.js
// Vercel Serverless Function for moleXa Educational API
// This file exports the Express app as a serverless function

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

// Trust proxy for Vercel
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

// ===== ROUTES =====

// Root API info
app.get('/', (req, res) => {
  res.json({
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    description: 'Enhanced proxy server for educational molecular data access',
    documentation: {
      interactive: '/api/docs',
      json: '/api/json/docs',
      live_analytics: '/api/dashboard'
    },
    base_url: 'https://molexa.org/api',
    status: 'online',
    uptime_minutes: Math.floor((new Date() - analytics.startTime) / (1000 * 60))
  });
});

// API Documentation Homepage
app.get('/api/docs', (req, res) => {
  res.send(generateMainDocsPage());
});

// JSON API Documentation
app.get('/api/json/docs', (req, res) => {
  res.json({
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    description: 'Enhanced proxy server for educational molecular data access',
    base_url: 'https://molexa.org/api',
    endpoints: {
      health: 'GET /api/health - Service health check',
      docs: 'GET /api/docs - Interactive documentation',
      analytics: 'GET /api/analytics - Analytics data',
      pubchem: 'GET /api/pubchem/* - PubChem proxy',
      educational: 'GET /api/pubchem/compound/{id}/educational',
      safety: 'GET /api/pugview/compound/{cid}/safety',
      autocomplete: 'GET /api/autocomplete/{query}'
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

// Dashboard
app.get('/api/dashboard', (req, res) => {
  res.send(generateDashboardPage());
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

// 404 handler
app.use('*', (req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    res.status(404).json({
      error: 'API endpoint not found',
      message: `Route ${req.originalUrl} not found`,
      base_url: 'https://molexa.org/api'
    });
  } else {
    res.redirect('/api/docs');
  }
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

function generateMainDocsPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>moleXa Educational API - Documentation</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        body { background: #f8f9fa; }
        .hero-section {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 4rem 0;
        }
        .feature-card {
            transition: transform 0.2s;
            border: none;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .feature-card:hover { transform: translateY(-5px); }
        .code-example {
            background: #2d3748;
            color: #e2e8f0;
            padding: 1rem;
            border-radius: 0.5rem;
            font-family: 'Courier New', monospace;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-light bg-white">
        <div class="container">
            <a class="navbar-brand fw-bold" href="/">
                <i class="fas fa-atom me-2 text-primary"></i>
                moleXa API
            </a>
            <div class="d-flex">
                <a href="/api/dashboard" class="btn btn-outline-primary btn-sm me-2">
                    <i class="fas fa-chart-line me-1"></i>Analytics
                </a>
                <a href="https://github.com/bazarkua/molexa-api" target="_blank" class="btn btn-outline-dark btn-sm">
                    <i class="fab fa-github me-1"></i>GitHub
                </a>
            </div>
        </div>
    </nav>

    <section class="hero-section">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-lg-8">
                    <h1 class="display-4 fw-bold mb-4">
                        <i class="fas fa-atom me-3"></i>
                        moleXa Educational API
                    </h1>
                    <p class="lead mb-4">
                        Enhanced proxy server providing comprehensive access to PubChem's molecular database 
                        with educational context, safety information, and live analytics.
                    </p>
                    <div class="d-flex flex-wrap gap-3 mb-4">
                        <span class="badge bg-light text-dark px-3 py-2">
                            <i class="fas fa-database me-1"></i>PUG-REST API
                        </span>
                        <span class="badge bg-light text-dark px-3 py-2">
                            <i class="fas fa-graduation-cap me-1"></i>Educational Context
                        </span>
                        <span class="badge bg-light text-dark px-3 py-2">
                            <i class="fas fa-shield-alt me-1"></i>Safety Data
                        </span>
                        <span class="badge bg-light text-dark px-3 py-2">
                            <i class="fas fa-chart-line me-1"></i>Live Analytics
                        </span>
                    </div>
                    <div class="d-flex gap-3">
                        <a href="#examples" class="btn btn-light btn-lg">
                            <i class="fas fa-rocket me-2"></i>Get Started
                        </a>
                        <a href="/api/dashboard" class="btn btn-outline-light btn-lg">
                            <i class="fas fa-chart-line me-2"></i>Live Dashboard
                        </a>
                    </div>
                </div>
                <div class="col-lg-4 text-center">
                    <div class="bg-white bg-opacity-10 rounded-3 p-4">
                        <h3>API Status</h3>
                        <div class="d-flex justify-content-center align-items-center mb-3">
                            <div class="bg-success rounded-circle me-2" style="width: 12px; height: 12px;"></div>
                            <span class="badge bg-success fs-6 px-3 py-2">Online</span>
                        </div>
                        <small class="d-block">Base URL:</small>
                        <code style="background: rgba(255,255,255,0.2); padding: 0.5rem; border-radius: 0.25rem;">
                            https://molexa.org/api
                        </code>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section id="examples" class="py-5">
        <div class="container">
            <h2 class="text-center mb-5">
                <i class="fas fa-code text-primary me-2"></i>
                Quick Start Examples
            </h2>
            <div class="row g-4">
                <div class="col-lg-6">
                    <div class="card feature-card">
                        <div class="card-header bg-primary text-white">
                            <h5 class="mb-0">
                                <i class="fas fa-graduation-cap me-2"></i>
                                Get Educational Data
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="code-example">
// Fetch comprehensive educational data for aspirin
const response = await fetch('https://molexa.org/api/pubchem/compound/aspirin/educational?type=name');
const data = await response.json();

console.log('Formula:', data.basic_properties.MolecularFormula);
console.log('Educational Context:', data.educational_context);
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card feature-card">
                        <div class="card-header bg-success text-white">
                            <h5 class="mb-0">
                                <i class="fas fa-search me-2"></i>
                                Chemical Autocomplete
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="code-example">
// Get autocomplete suggestions for chemical names
const response = await fetch('https://molexa.org/api/autocomplete/caffe?limit=5');
const suggestions = await response.json();

console.log('Suggestions:', suggestions.suggestions);
// Output: ["caffeine", "caffeic acid", ...]
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card feature-card">
                        <div class="card-header bg-info text-white">
                            <h5 class="mb-0">
                                <i class="fas fa-chart-line me-2"></i>
                                Live Analytics
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="code-example">
// Connect to real-time analytics stream
const eventSource = new EventSource('https://molexa.org/api/analytics/stream');

eventSource.onmessage = function(event) {
    const data = JSON.parse(event.data);
    console.log('Live update:', data);
};
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="card feature-card">
                        <div class="card-header bg-warning text-dark">
                            <h5 class="mb-0">
                                <i class="fas fa-flask me-2"></i>
                                Molecular Properties
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="code-example">
// Get molecular properties with educational context
const response = await fetch('https://molexa.org/api/pubchem/compound/cid/2244/property/MolecularFormula,MolecularWeight/JSON');
const data = await response.json();

console.log('Properties:', data.PropertyTable.Properties[0]);
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section class="py-5 bg-light">
        <div class="container">
            <h2 class="text-center mb-5">
                <i class="fas fa-link text-primary me-2"></i>
                API Endpoints
            </h2>
            <div class="row">
                <div class="col-md-6">
                    <h5>Core Endpoints</h5>
                    <ul class="list-unstyled">
                        <li class="mb-2">
                            <code>GET /api/health</code><br>
                            <small class="text-muted">Service health check</small>
                        </li>
                        <li class="mb-2">
                            <code>GET /api/analytics</code><br>
                            <small class="text-muted">Usage statistics</small>
                        </li>
                        <li class="mb-2">
                            <code>GET /api/dashboard</code><br>
                            <small class="text-muted">Live analytics dashboard</small>
                        </li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <h5>Educational Endpoints</h5>
                    <ul class="list-unstyled">
                        <li class="mb-2">
                            <code>GET /api/pubchem/compound/{id}/educational</code><br>
                            <small class="text-muted">Comprehensive educational data</small>
                        </li>
                        <li class="mb-2">
                            <code>GET /api/autocomplete/{query}</code><br>
                            <small class="text-muted">Chemical name suggestions</small>
                        </li>
                        <li class="mb-2">
                            <code>GET /api/pubchem/*</code><br>
                            <small class="text-muted">PubChem API proxy</small>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </section>

    <footer class="bg-dark text-white py-4">
        <div class="container">
            <div class="row">
                <div class="col-lg-8">
                    <h5>
                        <i class="fas fa-atom me-2"></i>
                        moleXa Educational API
                    </h5>
                    <p class="text-light">
                        Empowering chemistry education through enhanced access to molecular data.
                    </p>
                </div>
                <div class="col-lg-4 text-lg-end">
                    <a href="/api/json/docs" class="text-light me-3">JSON API Docs</a>
                    <a href="https://github.com/bazarkua/molexa-api" class="text-light">GitHub</a>
                </div>
            </div>
            <hr class="text-light">
            <div class="text-center">
                <p class="mb-0">&copy; 2025 Adilbek Bazarkulov. MIT License.</p>
            </div>
        </div>
    </footer>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `;
}

function generateDashboardPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>moleXa API - Live Analytics Dashboard</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        body { background: #f8f9fa; }
        .stat-card { 
            transition: transform 0.2s; 
            border: none;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .stat-card:hover { transform: translateY(-2px); }
        .activity-feed {
            height: 400px;
            overflow-y: auto;
            background: white;
            border-radius: 0.5rem;
            padding: 1rem;
        }
        .recent-request {
            border-left: 3px solid #007bff;
            background: #f8f9fa;
            margin-bottom: 0.5rem;
            padding: 0.75rem;
            border-radius: 0.375rem;
        }
    </style>
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container">
            <a class="navbar-brand fw-bold" href="/api/docs">
                <i class="fas fa-chart-line me-2"></i>moleXa API Analytics
            </a>
            <div class="d-flex">
                <span class="badge bg-light text-dark me-2">
                    <i class="fas fa-circle text-success me-1"></i>Live
                </span>
                <a href="/api/docs" class="btn btn-outline-light btn-sm">
                    <i class="fas fa-book me-1"></i>API Docs
                </a>
            </div>
        </div>
    </nav>

    <div class="container mt-4">
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body text-center">
                        <i class="fas fa-globe fa-2x text-primary mb-2"></i>
                        <h3 class="mb-0" id="totalRequests">0</h3>
                        <p class="text-muted mb-0">Total Requests</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body text-center">
                        <i class="fas fa-clock fa-2x text-success mb-2"></i>
                        <h3 class="mb-0" id="requestsThisHour">0</h3>
                        <p class="text-muted mb-0">This Hour</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body text-center">
                        <i class="fas fa-graduation-cap fa-2x text-info mb-2"></i>
                        <h3 class="mb-0" id="educationalRequests">0</h3>
                        <p class="text-muted mb-0">Educational</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card stat-card">
                    <div class="card-body text-center">
                        <i class="fas fa-server fa-2x text-warning mb-2"></i>
                        <h3 class="mb-0" id="uptime">0m</h3>
                        <p class="text-muted mb-0">Uptime</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="row">
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        <h5 class="mb-0">
                            <i class="fas fa-activity text-primary me-2"></i>
                            Recent Activity
                        </h5>
                    </div>
                    <div class="card-body p-0">
                        <div class="activity-feed" id="activityFeed">
                            <div class="text-center text-muted">
                                <i class="fas fa-hourglass-half fa-2x mb-3"></i>
                                <p>Loading recent activity...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Load analytics data
        fetch('/api/analytics')
            .then(response => response.json())
            .then(data => {
                document.getElementById('totalRequests').textContent = data.totalRequests;
                document.getElementById('requestsThisHour').textContent = data.requestsThisHour || 0;
                document.getElementById('uptime').textContent = data.uptimeMinutes + 'm';
                
                const educationalCount = (data.recentRequests || []).filter(r => 
                    r.type && r.type.toLowerCase().includes('educational')).length;
                document.getElementById('educationalRequests').textContent = educationalCount;
                
                // Show recent requests
                const feed = document.getElementById('activityFeed');
                if (data.recentRequests && data.recentRequests.length > 0) {
                    feed.innerHTML = data.recentRequests.slice(0, 10).map(req => \`
                        <div class="recent-request">
                            <div class="d-flex justify-content-between">
                                <div>
                                    <span class="badge bg-primary me-2">\${req.type}</span>
                                    <small>\${req.endpoint}</small>
                                </div>
                                <small class="text-muted">\${new Date(req.timestamp).toLocaleTimeString()}</small>
                            </div>
                        </div>
                    \`).join('');
                } else {
                    feed.innerHTML = '<div class="text-center text-muted"><p>No recent activity</p></div>';
                }
            })
            .catch(error => {
                console.error('Error loading analytics:', error);
            });
    </script>
</body>
</html>
  `;
}

// IMPORTANT: Export the Express app as a serverless function
module.exports = app;