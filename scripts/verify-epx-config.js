/**
 * EPX Configuration Verification Script
 * Verifies that EPX_PUBLIC_KEY matches EPX_TERMINAL_PROFILE_ID
 */

function decodePublicKey(publicKey) {
  try {
    const decoded = Buffer.from(publicKey, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('❌ Failed to decode public key:', error.message);
    return null;
  }
}

function verifyEPXConfig(publicKey, terminalProfileId, environment) {
  console.log('\n=== EPX Configuration Verification ===\n');
  
  console.log('Environment:', environment);
  console.log('Terminal Profile ID (from env):', terminalProfileId);
  console.log('Public Key (base64):', publicKey);
  
  const decoded = decodePublicKey(publicKey);
  if (!decoded) {
    return false;
  }
  
  console.log('\nDecoded Public Key:', JSON.stringify(decoded, null, 2));
  
  const publicKeyTerminalId = decoded.terminalProfileId;
  console.log('\nTerminal Profile ID in Public Key:', publicKeyTerminalId);
  console.log('Terminal Profile ID (env var):', terminalProfileId);
  
  const match = publicKeyTerminalId === terminalProfileId;
  
  if (match) {
    console.log('\n✅ Configuration is CORRECT - IDs match!');
  } else {
    console.log('\n❌ Configuration MISMATCH - IDs do not match!');
    console.log('\n⚠️  ACTION REQUIRED:');
    console.log('   You need to get the correct production public key from EPX');
    console.log('   for terminal profile:', terminalProfileId);
    console.log('\n   Current public key is for terminal:', publicKeyTerminalId);
  }
  
  return match;
}

// Check both local and production configs
console.log('=============================================');
console.log('CHECKING LOCAL .ENV CONFIGURATION');
console.log('=============================================');

// Local config (from .env)
const localPublicKey = 'eyAidGVybWluYWxQcm9maWxlSWQiOiAiNzJjNzg5OTEtYTdjNS00NTQwLWE0YzgtNDUyM2UxOTgxNTc2IiB9';
const localTerminalId = '72c78991-a7c5-4540-a4c8-4523e1981576';
verifyEPXConfig(localPublicKey, localTerminalId, 'sandbox');

console.log('\n\n=============================================');
console.log('CHECKING PRODUCTION CONFIGURATION (from logs)');
console.log('=============================================');

// Production config (from logs)
const prodPublicKey = 'eyAidGVybWluYWxQcm9maWxlSWQiOiAiNzJjNzg5OTEtYTdjNS00NTQwLWE0YzgtNDUyM2UxOTgxNTc2IiB9';
const prodTerminalId = '80d81625-fe00-47bd-89c9-63ca98d7fe91';
const prodMatch = verifyEPXConfig(prodPublicKey, prodTerminalId, 'production');

if (!prodMatch) {
  console.log('\n\n=============================================');
  console.log('RESOLUTION STEPS');
  console.log('=============================================');
  console.log('\n1. Contact EPX support or check your EPX portal');
  console.log('2. Request the PublicKey for terminal profile:');
  console.log('   ', prodTerminalId);
  console.log('\n3. Update DigitalOcean environment variable:');
  console.log('   EPX_PUBLIC_KEY=[new public key from EPX]');
  console.log('\n4. Redeploy your application');
  console.log('\n5. Verify the fix by running a test payment');
}

console.log('\n=============================================\n');
