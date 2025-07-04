// test-server.js
// Updated test script for moleXa Educational Proxy API
// Tests production deployment at molexa.org/api with new URL structure

const fetch = require('node-fetch');

// Configuration for different environments
const environments = {
  local: 'http://localhost:3001',
  production: 'http://molexa-api.vercel.app'
};

// Default to production for testing deployed version
const BASE_URL = process.env.TEST_ENV === 'local' ? environments.local : environments.production;
const IS_PRODUCTION = BASE_URL.includes('molexa.org');

console.log(`🌐 Testing environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'LOCAL'}`);
console.log(`📍 Base URL: ${BASE_URL}`);

async function testEndpoint(name, url, expectError = false, timeout = 15000) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`📍 URL: ${url}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'moleXa-API-Test/1.0'
      }
    });
    
    clearTimeout(timeoutId);
    const contentType = response.headers.get('content-type');
    
    console.log(`✅ Status: ${response.status} ${response.statusText}`);
    console.log(`📄 Content-Type: ${contentType}`);
    
    if (expectError && response.status >= 400) {
      console.log(`✅ Expected error received`);
      const data = await response.json();
      console.log(`📊 Error Response:`, JSON.stringify(data, null, 2).substring(0, 200) + '...');
      return true;
    }
    
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();
      
      // Log key information based on endpoint type
      if (data.service && data.version) {
        console.log(`🎯 Service: ${data.service} v${data.version}`);
        if (data.base_url) console.log(`🔗 Base URL: ${data.base_url}`);
      } else if (data.IdentifierList && data.IdentifierList.CID) {
        console.log(`🎯 Found ${data.IdentifierList.CID.length} compound(s): [${data.IdentifierList.CID.slice(0, 3).join(', ')}...]`);
      } else if (data.PropertyTable && data.PropertyTable.Properties) {
        const props = data.PropertyTable.Properties[0];
        console.log(`🎯 Properties: Formula=${props.MolecularFormula}, MW=${props.MolecularWeight}`);
      } else if (data.totalRequests !== undefined) {
        console.log(`📊 Analytics: ${data.totalRequests} total requests, ${data.recentRequestsCount || 0} recent`);
      } else if (data.cid && data.basic_properties) {
        console.log(`🎓 Educational Data: CID=${data.cid}, Formula=${data.basic_properties.MolecularFormula}`);
      } else if (data.query && data.suggestions) {
        console.log(`🔍 Autocomplete: ${data.suggestions.length} suggestions for "${data.query}"`);
      } else if (data.error) {
        console.log(`⚠️  Error response: ${data.error} - ${data.message}`);
      } else {
        console.log(`📊 Response preview:`, JSON.stringify(data, null, 2).substring(0, 150) + '...');
      }
    } else if (contentType && contentType.includes('text/html')) {
      console.log(`📄 HTML page served successfully (${response.headers.get('content-length') || 'unknown'} bytes)`);
    } else {
      const text = await response.text();
      console.log(`📝 Text response (${text.length} chars):`, text.substring(0, 100) + '...');
    }
    
    return response.ok;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`⏰ Timeout: Request took longer than ${timeout}ms`);
    } else {
      console.log(`❌ Error: ${error.message}`);
    }
    return false;
  }
}

async function runProductionTests() {
  console.log('🚀 Starting Production Tests for moleXa Educational API...\n');
  console.log('Testing optimized /api/* endpoint structure for molexa.org deployment\n');
  
  const productionTests = [
    // 1. API Root - should return API information
    {
      name: '1. API Root Information',
      url: `${BASE_URL}/`,
      description: 'Verify API root returns service information'
    },
    
    // 2. Main API Documentation Homepage 
    {
      name: '2. Main API Documentation Homepage',
      url: `${BASE_URL}/api/docs`,
      description: 'Primary entry point - interactive documentation'
    },
    
    // 3. JSON API Documentation
    {
      name: '3. JSON API Documentation',
      url: `${BASE_URL}/api/json/docs`,
      description: 'Machine-readable API specification'
    },
    
    // 4. Health Check with Analytics
    {
      name: '4. API Health Check',
      url: `${BASE_URL}/api/health`,
      description: 'Service health status and feature list'
    },
    
    // 5. Live Analytics Data
    {
      name: '5. Live Analytics Data',
      url: `${BASE_URL}/api/analytics`,
      description: 'Real-time usage statistics and metrics'
    },
    
    // 6. Core PubChem Functionality - Name Search
    {
      name: '6. Aspirin Name Search (PubChem Proxy)',
      url: `${BASE_URL}/api/pubchem/compound/name/aspirin/cids/JSON`,
      description: 'Test core compound search functionality',
      timeout: 20000
    },
    
    // 7. Enhanced Educational Endpoint
    {
      name: '7. Educational Data for Caffeine',
      url: `${BASE_URL}/api/pubchem/compound/caffeine/educational?type=name`,
      description: 'Comprehensive educational molecular data',
      timeout: 25000
    },
    
    // 8. Property Retrieval with Educational Context
    {
      name: '8. Aspirin Molecular Properties',
      url: `${BASE_URL}/api/pubchem/compound/cid/2244/property/MolecularFormula,MolecularWeight,XLogP,TPSA/JSON`,
      description: 'Enhanced molecular property retrieval',
      timeout: 20000
    },
    
    // 9. Autocomplete Feature
    {
      name: '9. Chemical Name Autocomplete',
      url: `${BASE_URL}/api/autocomplete/caffe?limit=5`,
      description: 'Intelligent chemical name suggestions',
      timeout: 15000
    },
    
    // 10. Structure Visualization
    {
      name: '10. Aspirin Structure Image',
      url: `${BASE_URL}/api/pubchem/compound/cid/2244/PNG`,
      description: 'Molecular structure image generation',
      timeout: 25000
    },
    
    // 11. Safety Data (Educational Priority)
    {
      name: '11. Safety Information for Aspirin',
      url: `${BASE_URL}/api/pugview/compound/2244/safety?heading=Toxicity`,
      description: 'Safety and hazard information for education',
      timeout: 30000 // PUG-View can be slower
    },
    
    // 12. Educational Headings
    {
      name: '13. Available Educational Headings',
      url: `${BASE_URL}/api/pugview/headings/safety`,
      description: 'Available educational content categories'
    },
    
    // 13. Error Handling Test
    {
      name: '14. Invalid Compound Error Handling',
      url: `${BASE_URL}/api/pubchem/compound/name/nonexistentcompound999/cids/JSON`,
      description: 'Proper error handling for invalid requests',
      expectError: true,
      timeout: 20000
    },
    
    // 14. Non-existent API endpoint
    {
      name: '15. Non-existent API Endpoint',
      url: `${BASE_URL}/api/nonexistent`,
      description: 'API 404 handling',
      expectError: true
    }
  ];
  
  let passed = 0;
  let total = productionTests.length;
  let results = [];
  
  console.log(`📊 Running ${total} production tests...\n`);
  
  for (const test of productionTests) {
    const success = await testEndpoint(
      test.name, 
      test.url, 
      test.expectError || false,
      test.timeout || 15000
    );
    
    results.push({
      name: test.name,
      description: test.description,
      success: success,
      category: categorizeTest(test.name)
    });
    
    if (success) passed++;
    
    // Respectful delay between requests (especially important for production)
    await new Promise(resolve => setTimeout(resolve, IS_PRODUCTION ? 500 : 250));
  }
  
  // Results Summary
  console.log(`\n📊 PRODUCTION TESTS SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Overall Result: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);
  console.log(`Environment: ${IS_PRODUCTION ? 'PRODUCTION (molexa.org)' : 'LOCAL DEVELOPMENT'}`);
  
  // Group results by category
  const categories = {};
  results.forEach(result => {
    if (!categories[result.category]) {
      categories[result.category] = { passed: 0, total: 0, tests: [] };
    }
    categories[result.category].total++;
    categories[result.category].tests.push(result);
    if (result.success) categories[result.category].passed++;
  });
  
  console.log(`\n📋 Results by Category:`);
  for (const [category, data] of Object.entries(categories)) {
    const percentage = Math.round((data.passed / data.total) * 100);
    const status = data.passed === data.total ? '✅' : data.passed > 0 ? '⚠️' : '❌';
    console.log(`${status} ${category}: ${data.passed}/${data.total} (${percentage}%)`);
    
    // Show failed tests
    const failed = data.tests.filter(t => !t.success);
    if (failed.length > 0) {
      failed.forEach(test => {
        console.log(`   ❌ ${test.name}`);
      });
    }
  }
  
  // Educational Impact Assessment
  const educationalFeatures = results.filter(r => 
    r.category === 'Educational Features' || r.category === 'Safety & Analytics'
  );
  const educationalSuccess = educationalFeatures.filter(f => f.success).length;
  
  console.log(`\n🎓 Educational Features: ${educationalSuccess}/${educationalFeatures.length} working`);
  
  if (passed === total) {
    console.log('\n🎉 EXCELLENT! All production tests passed!');
    console.log('✨ Your moleXa API is fully operational at molexa.org:');
    console.log('   • ✅ Core PubChem proxy functionality');
    console.log('   • ✅ Enhanced educational endpoints');
    console.log('   • ✅ Live analytics and monitoring');
    console.log('   • ✅ Safety and toxicity information');
    console.log('   • ✅ Interactive documentation');
    console.log('   • ✅ Error handling and robustness');
  } else if (passed >= 12) {
    console.log('\n✅ GOOD! Most functionality is working on production.');
    console.log('Minor issues detected - check failed tests above.');
  } else if (passed >= 8) {
    console.log('\n⚠️  PARTIAL! Core functionality works but some features need attention.');
    console.log('Review failed tests and check production logs.');
  } else {
    console.log('\n❌ CRITICAL ISSUES! Multiple core functions are failing.');
    console.log('Check production deployment and configuration.');
  }
  
  console.log(`\n🔗 Production Links:`);
  console.log(`   • API Documentation: https://molexa.org/api/docs`);
  console.log(`   • Live Analytics: https://molexa.org/api/dashboard`);
  console.log(`   • Health Check: https://molexa.org/api/health`);
  console.log(`   • JSON API Docs: https://molexa.org/api/json/docs`);
  
  if (IS_PRODUCTION) {
    console.log(`\n🌐 Production Testing Complete!`);
    console.log(`📊 Ready for frontend integration with base URL: https://molexa.org/api`);
  }
  
  return passed === total;
}

function categorizeTest(testName) {
  if (testName.includes('Documentation') || testName.includes('API Root')) {
    return 'Documentation & Info';
  } else if (testName.includes('Educational') || testName.includes('Safety') || testName.includes('Analytics')) {
    return 'Educational Features';
  } else if (testName.includes('PubChem') || testName.includes('Properties') || testName.includes('Structure')) {
    return 'Core API Functions';
  } else if (testName.includes('Error') || testName.includes('Non-existent')) {
    return 'Error Handling';
  } else if (testName.includes('Autocomplete') || testName.includes('Search')) {
    return 'Search Features';
  } else {
    return 'Safety & Analytics';
  }
}

// Enhanced connectivity check
async function checkServerAndRun() {
  console.log(`🔍 Checking moleXa API Server at ${BASE_URL}...`);
  
  try {
    const healthUrl = `${BASE_URL}${IS_PRODUCTION ? '/api/health' : '/api/health'}`;
    const response = await fetch(healthUrl, { 
      timeout: 10000,
      headers: { 
        'Accept': 'application/json',
        'User-Agent': 'moleXa-API-Test/1.0'
      }
    });
    
    if (response.ok) {
      const healthData = await response.json();
      console.log('✅ Server is running!');
      console.log(`📊 Service: ${healthData.service || 'moleXa API'}`);
      console.log(`📈 Version: ${healthData.version || 'Unknown'}`);
      console.log(`🌐 Base URL: ${healthData.base_url || BASE_URL}`);
      if (healthData.analytics) {
        console.log(`📊 Total Requests: ${healthData.analytics.totalRequests || 0}`);
        console.log(`⏱️  Uptime: ${healthData.analytics.uptimeMinutes || 0} minutes`);
      }
      console.log(`🎓 Features: ${healthData.features?.length || 0} available\n`);
      
      const success = await runProductionTests();
      
      if (success) {
        console.log('\n🚀 Your moleXa Educational API is ready for production use!');
        console.log('🎯 Frontend can now integrate using https://molexa.org/api as base URL');
      }
      
    } else {
      throw new Error(`Server responded with status ${response.status}`);
    }
  } catch (error) {
    console.log('❌ Cannot connect to server!');
    console.log(`   Error: ${error.message}`);
    console.log('\n🔧 Troubleshooting steps:');
    
    if (IS_PRODUCTION) {
      console.log('   1. Check if molexa.org is accessible');
      console.log('   2. Verify Vercel deployment is running');
      console.log('   3. Check Vercel function logs');
      console.log('   4. Verify DNS and domain configuration');
      console.log('   5. Test with: curl https://molexa.org/api/health');
    } else {
      console.log('   1. Start local server: npm start');
      console.log('   2. Check port 3001 is available');
      console.log('   3. Verify server logs for errors');
      console.log('   4. Ensure all dependencies are installed');
    }
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
moleXa API Test Suite

Usage:
  npm test                    # Test production deployment (molexa.org)
  TEST_ENV=local npm test     # Test local development server
  node test-server.js         # Same as npm test
  
Environment Variables:
  TEST_ENV=local              # Test local server at localhost:3001
  TEST_ENV=production         # Test production at molexa.org (default)

Examples:
  npm test                    # Test https://molexa.org/api
  TEST_ENV=local npm test     # Test http://localhost:3001/api
  `);
  process.exit(0);
}

// Run the tests
console.log('🧪 moleXa API Production Test Suite');
console.log('====================================\n');
checkServerAndRun();