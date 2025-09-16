

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
    console.error('No enrollment data found');
    alert('No enrollment data found. Please start the enrollment process over.');
    navigate('/enrollment/start');
    return Promise.reject('No enrollment data');
  }
  
  const registrationPayload = {
    email: enrollmentData.email,
    password: enrollmentData.password || 'TempPassword123!',
    firstName: enrollmentData.firstName,
    lastName: enrollmentData.lastName,
    phone: enrollmentData.phone,
    termsAccepted: true,
    privacyAccepted: true,
    smsConsent: true,
    faqDownloaded: true
  };
  
  console.log('Registration payload:', registrationPayload);
  
  // Submit to API endpoint using apiClient with retry logic
  return apiClient.post('/api/registration', registrationPayload)
    .then(data => {
      console.log('Registration response:', data);
      if (data.success) {
        console.log('Registration successful');
        // Clear stored data
        clearEnrollmentData();
        // Clear URL parameters
        if (window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        navigate('/dashboard');
      } else {
        const errorMsg = data.error || data.message || 'Unknown error';
        console.error('Registration failed:', errorMsg);
        alert('Registration failed: ' + errorMsg);
      }
      return data;
    })
    .catch(error => {
      console.error('Registration error:', error);
      
      // Try direct fetch as fallback
      console.log('Retrying with direct fetch...');
      return fetch(`${apiClient.API_BASE_URL || 'https://getmydpcenrollment-production.up.railway.app'}/api/registration`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationPayload)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Fallback registration response:', data);
        if (data.success) {
          clearEnrollmentData();
          if (window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          navigate('/dashboard');
        } else {
          alert('Registration failed: ' + (data.error || 'Unknown error'));
        }
        return data;
      })
      .catch(fallbackError => {
        console.error('Both registration attempts failed:', fallbackError);
        alert('Registration failed. Please try again or contact support.');
        throw fallbackError;
      });
    });
}

export function debugRegistrationData() {
  console.log('=== REGISTRATION DEBUG ===');
  
  const storageData = getEnrollmentData();
  console.log('Storage data:', storageData);
  
  const urlData = getEnrollmentDataFromURL();
  console.log('URL data:', urlData);
  
  console.log('Current URL:', window.location.href);
  console.log('URL params:', window.location.search);
}
