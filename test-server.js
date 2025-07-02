// test-server.js
// Updated test script for Enhanced PubChem Educational Proxy API
// Tests the 12 most important endpoints including new analytics features

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001';

async function testEndpoint(name, url, expectError = false, timeout = 10000) {
  console.log(`\n🧪 Testing: ${name}`);
  console.log(`📍 URL: ${url}`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
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
      if (data.IdentifierList && data.IdentifierList.CID) {
        console.log(`🎯 Found ${data.IdentifierList.CID.length} compound(s): [${data.IdentifierList.CID.slice(0, 3).join(', ')}...]`);
      } else if (data.PropertyTable && data.PropertyTable.Properties) {
        const props = data.PropertyTable.Properties[0];
        console.log(`🎯 Properties: Formula=${props.MolecularFormula}, MW=${props.MolecularWeight}`);
      } else if (data.totalRequests !== undefined) {
        console.log(`📊 Analytics: ${data.totalRequests} total requests, ${data.recentRequestsCount} recent`);
      } else if (data.cid && data.basic_properties) {
        console.log(`🎓 Educational Data: CID=${data.cid}, Formula=${data.basic_properties.MolecularFormula}`);
      } else if (data.service) {
        console.log(`📚 Service: ${data.service} v${data.version}`);
      } else if (data.query && data.suggestions) {
        console.log(`🔍 Autocomplete: ${data.suggestions.length} suggestions for "${data.query}"`);
      } else {
        console.log(`📊 Response preview:`, JSON.stringify(data, null, 2).substring(0, 150) + '...');
      }
    } else if (contentType && contentType.includes('text/html')) {
      console.log(`📄 HTML page served successfully`);
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

async function runCriticalTests() {
  console.log('🚀 Starting Critical Tests for Enhanced Educational API...\n');
  console.log('Testing 12 most important endpoints for educational functionality\n');
  
  const criticalTests = [
    // 1. Server Health & Status
    {
      name: '1. Health Check with Analytics',
      url: `${BASE_URL}/health`,
      description: 'Verify server is running and analytics are working'
    },
    
    // 2. API Documentation
    {
      name: '2. JSON API Documentation',
      url: `${BASE_URL}/api/docs`,
      description: 'Check comprehensive API documentation'
    },
    
    // 3. Live Analytics (New Feature)
    {
      name: '3. Live Analytics Data',
      url: `${BASE_URL}/analytics`,
      description: 'Test real-time usage analytics'
    },
    
    // 4. Core PubChem Functionality - Name Search
    {
      name: '4. Aspirin Name Search',
      url: `${BASE_URL}/api/pubchem/compound/name/aspirin/cids/JSON`,
      description: 'Test basic compound search by name'
    },
    
    // 5. Core PubChem Functionality - Formula Search  
    {
      name: '5. Water Formula Search (H2O)',
      url: `${BASE_URL}/api/pubchem/compound/formula/H2O/cids/JSON`,
      description: 'Test compound search by molecular formula'
    },
    
    // 6. Enhanced Educational Endpoint (New Feature)
    {
      name: '6. Educational Data for Caffeine',
      url: `${BASE_URL}/api/pubchem/compound/caffeine/educational?type=name`,
      description: 'Test comprehensive educational molecular data'
    },
    
    // 7. Property Retrieval with Educational Context
    {
      name: '7. Aspirin Properties',
      url: `${BASE_URL}/api/pubchem/compound/cid/2244/property/MolecularFormula,MolecularWeight,XLogP,TPSA/JSON`,
      description: 'Test molecular property retrieval'
    },
    
    // 8. Autocomplete Feature (New)
    {
      name: '8. Chemical Name Autocomplete',
      url: `${BASE_URL}/api/autocomplete/caffe?limit=5`,
      description: 'Test intelligent chemical name suggestions'
    },
    
    // 9. Structure Visualization
    {
      name: '9. Aspirin Structure Image',
      url: `${BASE_URL}/api/pubchem/compound/cid/2244/PNG`,
      description: 'Test molecular structure image generation'
    },
    
    // 10. Safety Data (Educational Priority)
    {
      name: '10. Safety Information for Aspirin',
      url: `${BASE_URL}/api/pugview/compound/2244/safety?heading=Toxicity`,
      description: 'Test safety and hazard information retrieval',
      timeout: 15000 // PUG-View can be slower
    },
    
    // 11. Error Handling
    {
      name: '11. Invalid Compound Error Handling',
      url: `${BASE_URL}/api/pubchem/compound/name/nonexistentcompound999/cids/JSON`,
      description: 'Test proper error handling for invalid requests',
      expectError: true
    },
    
    // 12. Interactive Documentation (New)
    {
      name: '12. Interactive Documentation Page',
      url: `${BASE_URL}/docs`,
      description: 'Test integrated documentation with analytics'
    }
  ];
  
  let passed = 0;
  let total = criticalTests.length;
  let results = [];
  
  for (const test of criticalTests) {
    const success = await testEndpoint(
      test.name, 
      test.url, 
      test.expectError || false,
      test.timeout || 10000
    );
    
    results.push({
      name: test.name,
      description: test.description,
      success: success,
      category: test.name.includes('Analytics') ? 'Analytics' :
               test.name.includes('Educational') ? 'Educational' :
               test.name.includes('Safety') ? 'Safety' :
               test.name.includes('Error') ? 'Error Handling' :
               test.name.includes('Documentation') ? 'Documentation' : 'Core API'
    });
    
    if (success) passed++;
    
    // Respectful delay between requests
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  // Results Summary
  console.log(`\n📊 CRITICAL TESTS SUMMARY`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Overall Result: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);
  
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
    r.category === 'Educational' || r.category === 'Safety' || r.category === 'Analytics'
  );
  const educationalSuccess = educationalFeatures.filter(f => f.success).length;
  
  console.log(`\n🎓 Educational Features: ${educationalSuccess}/${educationalFeatures.length} working`);
  
  if (passed === total) {
    console.log('\n🎉 EXCELLENT! All critical tests passed!');
    console.log('✨ Your enhanced educational API is fully functional:');
    console.log('   • ✅ Core PubChem proxy functionality');
    console.log('   • ✅ Live analytics and monitoring');
    console.log('   • ✅ Enhanced educational endpoints');
    console.log('   • ✅ Safety and toxicity information');
    console.log('   • ✅ Interactive documentation');
    console.log('   • ✅ Error handling and robustness');
  } else if (passed >= 9) {
    console.log('\n✅ GOOD! Most critical functionality is working.');
    console.log('Minor issues detected - check failed tests above.');
  } else if (passed >= 6) {
    console.log('\n⚠️  PARTIAL! Core functionality works but enhancements may have issues.');
    console.log('Review failed tests and check server logs.');
  } else {
    console.log('\n❌ CRITICAL ISSUES! Multiple core functions are failing.');
    console.log('Check server status and configuration.');
  }
  
  console.log(`\n🔗 Quick Links:`);
  console.log(`   • Interactive Docs: http://localhost:3001/docs`);
  console.log(`   • Live Analytics: http://localhost:3001/analytics`);
  console.log(`   • Health Check: http://localhost:3001/health`);
  console.log(`   • API Reference: http://localhost:3001/api/docs`);
  
  return passed === total;
}

// Enhanced server connectivity check
async function checkServerAndRun() {
  console.log('🔍 Checking Enhanced Educational API Server...');
  
  try {
    const response = await fetch(`${BASE_URL}/health`, { 
      timeout: 5000,
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      const healthData = await response.json();
      console.log('✅ Server is running!');
      console.log(`📊 Service: ${healthData.service}`);
      console.log(`📈 Total Requests: ${healthData.analytics?.totalRequests || 0}`);
      console.log(`🎓 Features: ${healthData.features?.length || 0} available\n`);
      
      const success = await runCriticalTests();
      
      if (success) {
        console.log('\n🚀 Your educational API is ready for production use!');
      }
      
    } else {
      throw new Error(`Server responded with status ${response.status}`);
    }
  } catch (error) {
    console.log('❌ Cannot connect to server!');
    console.log(`   Error: ${error.message}`);
    console.log('\n🔧 Troubleshooting steps:');
    console.log('   1. Start server: npm start');
    console.log('   2. Check port 3001 is available');
    console.log('   3. Verify server logs for errors');
    console.log('   4. Ensure all dependencies are installed');
    console.log('   5. Check firewall/network settings');
  }
}

// Run the tests
checkServerAndRun();