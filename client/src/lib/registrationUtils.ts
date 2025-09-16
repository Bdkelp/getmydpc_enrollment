
import apiClient from './apiClient';
import { getEnrollmentData, getEnrollmentDataFromURL, clearEnrollmentData } from './storageUtils';

export function handleCompleteRegistration(navigate: (path: string) => void) {
  // Try to get data from storage first
  let enrollmentData = getEnrollmentData();
  
  // If no storage data, try URL parameters
  if (!enrollmentData || !enrollmentData.email) {
    enrollmentData = getEnrollmentDataFromURL();
    console.log('Using URL data:', enrollmentData);
  }
  
  if (!enrollmentData || !enrollmentData.email) {
    alert('No enrollment data found. Please start the enrollment process over.');
    navigate('/enrollment/start');
    return;
  }
  
  const registrationPayload = {
    email: enrollmentData.email,
    password: enrollmentData.password || 'TempPassword123!', // Handle password separately
    firstName: enrollmentData.firstName,
    lastName: enrollmentData.lastName,
    phone: enrollmentData.phone,
    termsAccepted: true,
    privacyAccepted: true,
    smsConsent: true,
    faqDownloaded: true
  };
  
  console.log('Registration payload:', registrationPayload);
  
  // Submit to API endpoint using apiClient
  return apiClient.post('/api/registration', registrationPayload)
    .then(data => {
      console.log('Registration response:', data);
      if (data.success) {
        alert('Registration successful!');
        // Clear stored data
        clearEnrollmentData();
        navigate('/dashboard');
      } else {
        alert('Registration failed: ' + (data.error || 'Unknown error'));
      }
      return data;
    })
    .catch(error => {
      console.error('Registration error:', error);
      alert('Registration failed. Please try again.');
      throw error;
    });
}
