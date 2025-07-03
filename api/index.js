// Enhanced PubChem Backend Proxy Server for Educational Applications
// Restored to original working setup with molexa.org domain updates

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

// 📊 Analytics tracking
const analytics = {
  totalRequests: 0,
  recentRequests: [], // Keep last 100 requests
  requestsByEndpoint: {},
  requestsByHour: {},
  startTime: new Date()
};

// Store SSE connections for real-time updates
const sseConnections = new Set();

// Enable CORS for all routes
app.use(cors({
  origin: [
    'https://molexa.org',
    'https://www.molexa.org',
    'http://localhost:3000', 
    'http://localhost:5173', 
    'http://127.0.0.1:5173',
    /^https:\/\/.*\.vercel\.app$/
  ],
  credentials: true
}));

app.use(express.json());

// Also make sure you have proper static file serving:
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

// ✅ This should be BEFORE your route handlers
app.use(express.static(path.join(__dirname, '..', 'public')));

// 📊 Analytics middleware - Track all API requests
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

  // Update analytics
  analytics.totalRequests++;
  analytics.recentRequests.unshift(requestData);
  
  // Keep only last 100 requests
  if (analytics.recentRequests.length > 100) {
    analytics.recentRequests = analytics.recentRequests.slice(0, 100);
  }

  // Track by endpoint
  const endpointCategory = getEndpointCategory(req.originalUrl);
  analytics.requestsByEndpoint[endpointCategory] = (analytics.requestsByEndpoint[endpointCategory] || 0) + 1;

  // Track by hour
  const hour = new Date().getHours();
  analytics.requestsByHour[hour] = (analytics.requestsByHour[hour] || 0) + 1;

  console.log(`📊 [${analytics.totalRequests}] ${req.method} ${req.originalUrl} - ${requestData.type}`);

  // Broadcast to SSE connections
  broadcastToSSE({
    type: 'new_request',
    data: requestData,
    analytics: getAnalyticsSummary()
  });

  next();
});

// Helper functions for analytics
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
  if (url.includes('/compound/smiles/')) return 'SMILES Search';
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

// Root route - serve index.html
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

// 📊 Analytics endpoints
app.get('/analytics', (req, res) => {
  res.json({
    ...getAnalyticsSummary(),
    recentRequests: analytics.recentRequests.slice(0, 20),
    requestsByEndpoint: analytics.requestsByEndpoint,
    requestsByHour: analytics.requestsByHour,
    startTime: analytics.startTime
  });
});

// 📊 Server-Sent Events for real-time updates
app.get('/analytics/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial data
  res.write(`data: ${JSON.stringify({
    type: 'initial',
    analytics: getAnalyticsSummary(),
    recentRequests: analytics.recentRequests.slice(0, 10)
  })}\n\n`);

  // Add connection to set
  sseConnections.add(res);

  // Clean up on client disconnect
  req.on('close', () => {
    sseConnections.delete(res);
  });

  // Keep alive ping every 30 seconds
  const keepAlive = setInterval(() => {
    try {
      res.write(`: keepalive\n\n`);
    } catch (error) {
      clearInterval(keepAlive);
      sseConnections.delete(res);
    }
  }, 30000);
});

// 📊 Analytics Dashboard HTML page
app.get('/dashboard', (req, res) => {
  res.send(generateDashboardPage());
});

// Health check endpoint (enhanced with analytics)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    timestamp: new Date().toISOString(),
    base_url: 'https://molexa.org',
    cache_stats: cache.getStats(),
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

// API root
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

// API Documentation - serve index.html or fallback to generated HTML
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

// JSON API documentation
app.get('/api/json/docs', (req, res) => {
  res.json({
    service: 'moleXa Educational Proxy API',
    version: '2.1.0',
    description: 'Enhanced proxy server for educational molecular data access with live analytics',
    base_url: 'https://molexa.org/api',
    homepage: 'https://molexa.org',
    documentation: 'https://molexa.org/api/docs',
    endpoints: {
      health: 'GET /api/health - Service health check with analytics',
      docs: 'GET /api/docs - Interactive documentation',
      docs_json: 'GET /api/json/docs - This JSON documentation',
      analytics: 'GET /api/analytics - Analytics data (JSON)',
      analytics_stream: 'GET /api/analytics/stream - Real-time SSE stream',
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
      'Live request analytics with educational impact metrics',
      'Real-time usage statistics via Server-Sent Events',
      'Educational impact tracking and visualization', 
      'Integrated documentation with live analytics dashboard'
    ]
  });
});

// Analytics endpoints with /api prefix
app.get('/api/analytics', (req, res) => {
  res.json({
    ...getAnalyticsSummary(),
    recentRequests: analytics.recentRequests.slice(0, 20),
    requestsByEndpoint: analytics.requestsByEndpoint,
    requestsByHour: analytics.requestsByHour,
    startTime: analytics.startTime
  });
});

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

app.get('/api/dashboard', (req, res) => {
  res.send(generateDashboardPage());
});

// Enhanced compound data endpoint with educational properties
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
    if (identifierType !== 'cid') {
      const encodedIdentifier = encodeURIComponent(identifier.toLowerCase().trim());
      console.log(`🔍 Searching for CID using ${identifierType}: ${encodedIdentifier}`);
      
      const cidResponse = await fetchFromPubChem(`compound/${identifierType}/${encodedIdentifier}/cids/JSON`);
      if (cidResponse.IdentifierList && cidResponse.IdentifierList.CID) {
        cid = cidResponse.IdentifierList.CID[0];
        console.log(`✅ Found CID: ${cid} for ${identifier}`);
      } else {
        return res.status(404).json({ 
          error: 'Compound not found',
          message: `No compound found for "${identifier}" using ${identifierType} search`,
          suggestions: [
            'Check the spelling of the compound name',
            'Try alternative names (e.g., "acetylsalicylic acid" for aspirin)',
            'Use a different identifier type (name, formula, smiles)',
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
        found_via: identifierType !== 'cid' ? `${identifierType} search` : 'direct CID'
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

function generateMainDocsPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>moleXa Educational API - Documentation & Analytics</title>
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
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
  sseConnections.forEach(connection => connection.end());
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully');
  sseConnections.forEach(connection => connection.end());
  process.exit(0);
});

module.exports = app;