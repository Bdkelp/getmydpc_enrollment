import { config } from 'dotenv';
config();

const API_URL = process.env.VITE_API_URL || 'http://localhost:5000';

async function testLeadSubmission() {
  console.log('Testing lead form submission...');
  console.log('API URL:', API_URL);

  const testData = {
    firstName: 'Test',
    lastName: 'Lead',
    email: 'testlead@example.com',
    phone: '555-123-4567',
    message: 'This is a test lead submission'
  };

  try {
    const response = await fetch(`${API_URL}/api/public/leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    const data = await response.json();

    console.log('\n=== Response ===');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(data, null, 2));

    if (response.ok) {
      console.log('\n✅ Lead submission successful!');
      console.log('Lead ID:', data.leadId);
    } else {
      console.log('\n❌ Lead submission failed');
      console.log('Error:', data.error);
      console.log('Details:', data.details);
    }
  } catch (error) {
    console.error('\n❌ Request failed:', error.message);
  }
}

testLeadSubmission();
