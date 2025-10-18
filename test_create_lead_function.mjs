import { storage } from './server/storage.ts';
import dotenv from 'dotenv';

dotenv.config();

async function testCreateLeadFunction() {
  console.log('🧪 Testing createLead() function from storage.ts...\n');

  const leadData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'johndoe@example.com',
    phone: '5551234567',
    message: 'I am interested in learning more about your DPC membership plans.',
    source: 'contact_form',
    status: 'new'
  };

  console.log('📝 Creating lead with data:', leadData);

  try {
    const result = await storage.createLead(leadData);
    console.log('\n✅ Lead created successfully!');
    console.log('   Result:', result);
    
    // Clean up
    console.log('\n🧹 Cleaning up test lead...');
    // Note: We don't have a deleteLead function, so we'll leave it or manually clean
    console.log('   (Lead ID:', result.id, '- clean up manually if needed)');
    
  } catch (error) {
    console.error('\n❌ Lead creation FAILED:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
  }
}

testCreateLeadFunction().catch(console.error);
