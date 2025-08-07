// Test script to verify role update endpoint
const testRoleUpdate = async () => {
  try {
    // First, get a valid session token
    const loginResponse = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'michael@mypremierplans.com',
        password: 'your_password_here' // You'll need to provide the password
      })
    });

    if (!loginResponse.ok) {
      console.error('Login failed:', await loginResponse.text());
      return;
    }

    const { token } = await loginResponse.json();
    console.log('Login successful, token received');

    // Now try to update a user's role
    const updateResponse = await fetch('http://localhost:5000/api/admin/user/test-user-id/role', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        role: 'agent'
      })
    });

    console.log('Update response status:', updateResponse.status);
    const result = await updateResponse.text();
    console.log('Update response:', result);

  } catch (error) {
    console.error('Test failed:', error);
  }
};

console.log('Testing role update endpoint...');
testRoleUpdate();