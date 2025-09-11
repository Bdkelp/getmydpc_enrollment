
#!/usr/bin/env node

// Simple test script to verify deployment functionality
console.log('🔧 Testing Deployment Configuration...\n');

// Test environment variables
console.log('Environment Variables:');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? '✅ set' : '❌ not set'}`);
console.log(`VITE_SUPABASE_ANON_KEY: ${process.env.VITE_SUPABASE_ANON_KEY ? '✅ set' : '❌ not set'}`);

// Test basic functionality
const testBasicFunctionality = () => {
  console.log('\n🧪 Testing Basic Functionality:');
  
  try {
    // Test if we can import main modules
    const express = require('express');
    console.log('✅ Express import successful');
    
    const path = require('path');
    console.log('✅ Path module working');
    
    console.log('✅ Basic Node.js functionality working');
    
  } catch (error) {
    console.log('❌ Basic functionality test failed:', error.message);
  }
};

testBasicFunctionality();

console.log('\n🚀 Deployment test complete!');
console.log('\nNext steps:');
console.log('1. Deploy using the Deploy button in Replit');
console.log('2. Test authentication at /login');
console.log('3. Test admin access at /admin');
console.log('4. Verify API endpoints with /health');
