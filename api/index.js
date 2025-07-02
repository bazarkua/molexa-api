// Enhanced PubChem Backend Proxy Server for Educational Applications
// Now with Live Request Analytics Dashboard

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

// 📊 NEW: Analytics tracking
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
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

app.use(express.json());


// ⚡ CRITICAL: Serve static files FIRST
app.use(express.static(path.join(__dirname, '..', 'static')));




// 📊 NEW: Analytics middleware - Track all API requests
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

// 📊 NEW: Analytics endpoints
app.get('/analytics', (req, res) => {
  res.json({
    ...getAnalyticsSummary(),
    recentRequests: analytics.recentRequests.slice(0, 20),
    requestsByEndpoint: analytics.requestsByEndpoint,
    requestsByHour: analytics.requestsByHour,
    startTime: analytics.startTime
  });
});

// 📊 NEW: Server-Sent Events for real-time updates
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

// 📊 NEW: Analytics Dashboard HTML page
app.get('/dashboard', (req, res) => {
  res.send(`
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
            .stat-card { transition: transform 0.2s; }
            .stat-card:hover { transform: translateY(-2px); }
            .pulse { animation: pulse 2s infinite; }
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.05); }
                100% { transform: scale(1); }
            }
            .recent-request {
                border-left: 3px solid #007bff;
                background: white;
                margin-bottom: 0.5rem;
                padding: 0.75rem;
                border-radius: 0.375rem;
                transition: all 0.3s ease;
            }
            .recent-request.new {
                border-left-color: #28a745;
                box-shadow: 0 0 15px rgba(40, 167, 69, 0.3);
            }
            .activity-feed {
                height: 400px;
                overflow-y: auto;
            }
            .navbar { box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .badge-request-type {
                font-size: 0.7rem;
                padding: 0.25rem 0.5rem;
            }
            .chart-container {
                background: white;
                border-radius: 0.5rem;
                padding: 1.5rem;
                box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            }
        </style>
    </head>
    <body>
        <!-- Navigation -->
        <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
            <div class="container">
                <a class="navbar-brand fw-bold" href="/">
                    <i class="fas fa-chart-line me-2"></i>
                    moleXa API Analytics
                </a>
                <div class="d-flex">
                    <span class="badge bg-light text-dark me-2" id="status">
                        <i class="fas fa-circle text-success me-1"></i>Live
                    </span>
                    <a href="/docs" class="btn btn-outline-light btn-sm">
                        <i class="fas fa-book me-1"></i>API Docs
                    </a>
                </div>
            </div>
        </nav>

        <div class="container mt-4">
            <!-- Stats Row -->
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card stat-card border-0 shadow-sm">
                        <div class="card-body text-center">
                            <i class="fas fa-globe fa-2x text-primary mb-2"></i>
                            <h3 class="mb-0" id="totalRequests">0</h3>
                            <p class="text-muted mb-0">Total Requests</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card stat-card border-0 shadow-sm">
                        <div class="card-body text-center">
                            <i class="fas fa-clock fa-2x text-success mb-2"></i>
                            <h3 class="mb-0" id="requestsThisHour">0</h3>
                            <p class="text-muted mb-0">This Hour</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card stat-card border-0 shadow-sm">
                        <div class="card-body text-center">
                            <i class="fas fa-server fa-2x text-info mb-2"></i>
                            <h3 class="mb-0" id="uptime">0m</h3>
                            <p class="text-muted mb-0">Uptime</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card stat-card border-0 shadow-sm">
                        <div class="card-body text-center">
                            <i class="fas fa-users fa-2x text-warning mb-2"></i>
                            <h3 class="mb-0" id="activeConnections">1</h3>
                            <p class="text-muted mb-0">Live Viewers</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row">
                <!-- Recent Activity -->
                <div class="col-lg-8">
                    <div class="card border-0 shadow-sm">
                        <div class="card-header bg-white">
                            <h5 class="mb-0">
                                <i class="fas fa-activity text-primary me-2"></i>
                                Live Request Activity
                                <span class="badge bg-primary ms-2" id="activityCount">0</span>
                            </h5>
                        </div>
                        <div class="card-body p-0">
                            <div class="activity-feed p-3" id="activityFeed">
                                <div class="text-center text-muted">
                                    <i class="fas fa-hourglass-half fa-2x mb-3"></i>
                                    <p>Waiting for API requests...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Top Endpoints -->
                <div class="col-lg-4">
                    <div class="card border-0 shadow-sm">
                        <div class="card-header bg-white">
                            <h5 class="mb-0">
                                <i class="fas fa-chart-pie text-success me-2"></i>
                                Popular Endpoints
                            </h5>
                        </div>
                        <div class="card-body">
                            <div id="topEndpoints">
                                <div class="text-center text-muted">
                                    <i class="fas fa-chart-bar fa-2x mb-3"></i>
                                    <p>No data yet</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Educational Impact -->
                    <div class="card border-0 shadow-sm mt-4">
                        <div class="card-header bg-white">
                            <h5 class="mb-0">
                                <i class="fas fa-graduation-cap text-info me-2"></i>
                                Educational Impact
                            </h5>
                        </div>
                        <div class="card-body">
                            <div class="row text-center">
                                <div class="col-6">
                                    <div class="mb-3">
                                        <h4 class="text-primary" id="safetyRequests">0</h4>
                                        <small class="text-muted">Safety Lookups</small>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="mb-3">
                                        <h4 class="text-success" id="educationalRequests">0</h4>
                                        <small class="text-muted">Learning Resources</small>
                                    </div>
                                </div>
                            </div>
                            <div class="text-center">
                                <i class="fas fa-heart text-danger"></i>
                                <small class="text-muted">Empowering chemistry education</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <script>
            // Global state
            let totalRequests = 0;
            let recentRequests = [];
            
            // Connect to SSE stream
            const eventSource = new EventSource('/analytics/stream');
            
            eventSource.onmessage = function(event) {
                const data = JSON.parse(event.data);
                
                if (data.type === 'initial') {
                    updateAnalytics(data.analytics);
                    updateRecentRequests(data.recentRequests);
                } else if (data.type === 'new_request') {
                    addNewRequest(data.data);
                    updateAnalytics(data.analytics);
                }
            };
            
            eventSource.onerror = function(event) {
                document.getElementById('status').innerHTML = 
                    '<i class="fas fa-circle text-danger me-1"></i>Disconnected';
            };
            
            function updateAnalytics(analytics) {
                document.getElementById('totalRequests').textContent = analytics.totalRequests;
                document.getElementById('requestsThisHour').textContent = analytics.requestsThisHour;
                document.getElementById('uptime').textContent = analytics.uptimeMinutes + 'm';
                
                // Update top endpoints
                updateTopEndpoints(analytics.topEndpoints);
                
                // Update educational impact counters
                updateEducationalImpact();
            }
            
            function updateTopEndpoints(topEndpoints) {
                const container = document.getElementById('topEndpoints');
                if (!topEndpoints || topEndpoints.length === 0) return;
                
                container.innerHTML = topEndpoints.map(([endpoint, count]) => \`
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="text-truncate">\${endpoint}</span>
                        <span class="badge bg-primary">\${count}</span>
                    </div>
                \`).join('');
            }
            
            function addNewRequest(request) {
                recentRequests.unshift(request);
                if (recentRequests.length > 20) {
                    recentRequests = recentRequests.slice(0, 20);
                }
                
                const feed = document.getElementById('activityFeed');
                const requestElement = createRequestElement(request, true);
                
                if (feed.children.length === 0 || feed.children[0].classList.contains('text-center')) {
                    feed.innerHTML = '';
                }
                
                feed.insertBefore(requestElement, feed.firstChild);
                
                // Pulse effect for new request
                requestElement.classList.add('pulse');
                setTimeout(() => requestElement.classList.remove('pulse'), 2000);
                
                // Update activity count
                document.getElementById('activityCount').textContent = recentRequests.length;
                
                // Remove old requests
                const children = Array.from(feed.children);
                if (children.length > 20) {
                    children.slice(20).forEach(child => child.remove());
                }
            }
            
            function updateRecentRequests(requests) {
                recentRequests = requests;
                const feed = document.getElementById('activityFeed');
                
                if (requests.length === 0) return;
                
                feed.innerHTML = requests.map(request => 
                    createRequestElement(request).outerHTML
                ).join('');
                
                document.getElementById('activityCount').textContent = requests.length;
            }
            
            function createRequestElement(request, isNew = false) {
                const div = document.createElement('div');
                div.className = \`recent-request \${isNew ? 'new' : ''}\`;
                
                const timeAgo = new Date(request.timestamp).toLocaleTimeString();
                const typeColor = getTypeColor(request.type);
                
                div.innerHTML = \`
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center mb-1">
                                <span class="badge \${typeColor} badge-request-type me-2">\${request.type}</span>
                                <small class="text-muted">\${timeAgo}</small>
                            </div>
                            <div class="small text-truncate" style="max-width: 300px;">
                                <span class="badge bg-secondary me-1">\${request.method}</span>
                                \${request.endpoint}
                            </div>
                        </div>
                        <i class="fas fa-globe text-muted"></i>
                    </div>
                \`;
                
                return div;
            }
            
            function getTypeColor(type) {
                const colors = {
                    'Educational Overview': 'bg-primary',
                    'Safety Data': 'bg-warning',
                    'Pharmacology': 'bg-info',
                    'Properties': 'bg-secondary',
                    'Autocomplete': 'bg-success',
                    'Educational Annotations': 'bg-purple',
                    'Name Search': 'bg-primary',
                    'Structure Image': 'bg-info',
                    'Structure File': 'bg-secondary'
                };
                return colors[type] || 'bg-light text-dark';
            }
            
            function updateEducationalImpact() {
                const safetyCount = recentRequests.filter(r => 
                    r.type.includes('Safety') || r.endpoint.includes('safety')).length;
                const educationalCount = recentRequests.filter(r => 
                    r.type.includes('Educational') || r.endpoint.includes('educational')).length;
                
                document.getElementById('safetyRequests').textContent = safetyCount;
                document.getElementById('educationalRequests').textContent = educationalCount;
            }
            
            // Auto-refresh page title with request count
            setInterval(() => {
                document.title = \`moleXa API (\${totalRequests}) - Live Analytics\`;
            }, 1000);
        </script>
    </body>
    </html>
  `);
});

// Health check endpoint (enhanced with analytics)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'PubChem Educational Proxy',
    timestamp: new Date().toISOString(),
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
      // URL encode the identifier for proper API calls
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

    // Step 2: Fetch comprehensive properties
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
    
    // Step 3: Get synonyms for educational context
    console.log(`📚 Fetching synonyms for CID: ${cid}`);
    const synonymsData = await fetchFromPubChem(`compound/cid/${cid}/synonyms/JSON`);
    
    // Step 4: Get 3D conformer data for structure visualization  
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
      synonyms: synonymsData.InformationList?.Information?.[0]?.Synonym?.slice(0, 10) || [], // Limit to first 10 synonyms
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

    // Add educational context to properties
    if (educationalData.basic_properties) {
      educationalData.educational_context = addEducationalContext([educationalData.basic_properties]);
    }

    cache.set(cacheKey, educationalData);
    
    res.set('X-Cache', 'MISS');
    res.json(educationalData);

  } catch (error) {
    console.error('❌ Educational data error:', error);
    
    // More specific error handling
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

// Helper function to fetch from PubChem with enhanced error handling
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
    // Get the actual error response from PubChem
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

// Serve the integrated documentation page with live analytics
app.get('/docs', (req, res) => {
  try {
    const docsPath = path.join(__dirname, '..', 'static', 'docs.html');  
    // Check if the integrated docs file exists
    if (fs.existsSync(docsPath)) {
      res.sendFile(docsPath);
    } else {
      // Fallback: serve the integrated HTML directly (the one we created)
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>moleXa Educational API - Documentation & Live Analytics</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
        </head>
        <body class="bg-light">
            <div class="container mt-5">
                <div class="row justify-content-center">
                    <div class="col-lg-8">
                        <div class="card shadow">
                            <div class="card-body text-center p-5">
                                <img src="/static/android-chrome-192x192.png" alt="moleXa Logo" style="width: 64px; height: 64px;" class="mb-3">
                                <h2>📚 Interactive Documentation Available</h2>
                                <p class="text-muted mb-4">
                                    The integrated documentation page with live analytics is ready to be served!
                                </p>
                                <div class="alert alert-info" role="alert">
                                    <i class="fas fa-lightbulb me-2"></i>
                                    <strong>Setup Instructions:</strong><br>
                                    Save the integrated HTML documentation as <code>docs.html</code> in your project root directory
                                    to enable the full interactive documentation with live analytics.
                                </div>
                                <div class="d-grid gap-2 d-md-block">
                                    <a href="/api/docs" class="btn btn-primary">
                                        <i class="fas fa-code me-2"></i>
                                        View JSON API Docs
                                    </a>
                                    <a href="/health" class="btn btn-outline-success">
                                        <i class="fas fa-heartbeat me-2"></i>
                                        Health Check
                                    </a>
                                    <a href="/analytics" class="btn btn-outline-info">
                                        <i class="fas fa-chart-line me-2"></i>
                                        Analytics Data
                                    </a>
                                </div>
                                <hr class="my-4">
                                <div class="text-start">
                                    <h5>📊 Available Features:</h5>
                                    <ul class="text-muted">
                                        <li><strong>Live Analytics:</strong> <code>/analytics</code> - Real-time usage statistics</li>
                                        <li><strong>SSE Stream:</strong> <code>/analytics/stream</code> - Live request feed</li>
                                        <li><strong>Educational Data:</strong> Enhanced molecular data with context</li>
                                        <li><strong>Safety Information:</strong> Comprehensive toxicity and handling data</li>
                                        <li><strong>Interactive Documentation:</strong> Complete API reference with examples</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('❌ Error serving documentation:', error);
    res.status(500).json({
      error: 'Failed to serve documentation',
      message: 'Please ensure docs.html exists in the project root directory',
      fallback: 'Visit /api/docs for JSON documentation'
    });
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
    
    // Extract educational content based on section
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
    
    // Pre-defined educational headings categorized by topic
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

// Main PubChem proxy endpoint (enhanced with educational context)
app.get('/api/pubchem/*', async (req, res) => {
  try {
    const pubchemPath = req.params[0];
    const queryParams = new URLSearchParams(req.query).toString();
    const fullPath = queryParams ? `${pubchemPath}?${queryParams}` : pubchemPath;
    
    // Check cache first
    const cacheKey = `pubchem:${fullPath}`;
    const cachedData = cache.get(cacheKey);
    
    if (cachedData) {
      console.log(`📦 Cache hit for: ${fullPath}`);
      res.set('X-Cache', 'HIT');
      res.set('Content-Type', cachedData.contentType);
      return res.send(cachedData.data);
    }

    // Build PubChem URL
    const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/${fullPath}`;
    console.log(`🔍 Fetching from PubChem: ${pubchemUrl}`);

    // Add delay to respect rate limits (200ms between requests)
    await new Promise(resolve => setTimeout(resolve, 200));

    // Fetch from PubChem
    const response = await fetch(pubchemUrl, {
      headers: {
        'User-Agent': 'MoleculeStudio/1.0 (Educational Research Tool)',
        'Accept': '*/*'
      },
      timeout: 30000 // 30 second timeout
    });

    // Handle PubChem rate limiting
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

    // Get response data
    const contentType = response.headers.get('content-type') || 'application/json';
    let data;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    // Enhanced response with educational context
    if (fullPath.includes('/property/') && data.PropertyTable) {
      data.educational_context = addEducationalContext(data.PropertyTable.Properties);
    }

    // Cache the successful response
    cache.set(cacheKey, { data, contentType });
    console.log(`💾 Cached response for: ${fullPath}`);

    // Set response headers
    res.set('Content-Type', contentType);
    res.set('X-Cache', 'MISS');
    res.set('X-PubChem-URL', pubchemUrl);
    
    // Send response
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

// Helper functions for educational content
function extractSafetyData(data) {
  // Extract safety-related sections from PUG-View data
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
    
    // Add educational explanations for key properties
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

// Enhanced API documentation (JSON)
app.get('/api/docs', (req, res) => {
  res.json({
    service: 'PubChem Educational Proxy API',
    version: '2.1.0',
    description: 'Enhanced proxy server for educational molecular data access with live analytics',
    endpoints: {
      health: 'GET /health - Service health check with analytics',
      docs: 'GET /docs - Interactive documentation with live analytics',
      analytics: 'GET /analytics - Analytics data (JSON)',
      analytics_stream: 'GET /analytics/stream - Real-time SSE stream',
      pubchem: 'GET /api/pubchem/* - Proxy PubChem REST API calls',
      educational: 'GET /api/pubchem/compound/{id}/educational - Comprehensive educational data',
      pugview: 'GET /api/pugview/compound/{cid}/{section} - Educational annotations',
      autocomplete: 'GET /api/autocomplete/{query} - Chemical name suggestions',
      api_docs: 'GET /api/docs - This JSON documentation'
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
    new_features: [
      'Live request analytics with educational impact metrics',
      'Real-time usage statistics via Server-Sent Events',
      'Educational impact tracking and visualization', 
      'Integrated documentation with live analytics dashboard'
    ],
    analytics_features: {
      real_time_tracking: 'Monitor API usage as it happens',
      educational_categorization: 'Track how API serves educational purposes',
      impact_metrics: 'Measure safety lookups, learning requests, etc.',
      live_activity_feed: 'See recent API requests in real-time'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: ['/health', '/dashboard', '/analytics', '/api/docs', '/api/pubchem/*']
  });
});

// Start server
// app.listen(port, () => {
//   console.log(`
// 🚀 Enhanced PubChem Educational Proxy Started!
// 📍 Server running on: http://localhost:${port}
// 🏥 Health check: http://localhost:${port}/health
// 📊 Live Dashboard: http://localhost:${port}/dashboard
// 📈 Analytics API: http://localhost:${port}/analytics
// 📚 API docs: http://localhost:${port}/api/docs

// 🎓 Educational Features:
//    • Comprehensive molecular properties with explanations
//    • Safety and toxicity information
//    • Pharmacology and drug data  
//    • Live usage analytics and monitoring

// 🧪 Try the API:
//    • /api/pubchem/compound/aspirin/educational?type=name
//    • /api/pubchem/compound/cid/2244/property/MolecularFormula/JSON

// 📊 Monitor usage at: /dashboard
//   `);
// });

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