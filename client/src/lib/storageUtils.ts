
// Storage utility functions with fallbacks for enrollment data
export function saveEnrollmentData(data: any) {
  try {
    // Try localStorage first
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('enrollmentData', JSON.stringify(data));
      console.log('Saved to localStorage');
    } else if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('enrollmentData', JSON.stringify(data));
      console.log('Saved to sessionStorage');
    } else {
      // Fallback to in-memory storage
      (window as any).enrollmentData = data;
      console.log('Saved to window object');
    }
  } catch (error) {
    console.error('Storage error:', error);
    // Use window object as last resort
    (window as any).enrollmentData = data;
  }
}

export function getEnrollmentData() {
  try {
    // Try localStorage first
    if (typeof localStorage !== 'undefined') {
      const data = localStorage.getItem('enrollmentData');
      if (data) return JSON.parse(data);
    }
    
    // Try sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      const data = sessionStorage.getItem('enrollmentData');
      if (data) return JSON.parse(data);
    }
    
    // Try window object
    if ((window as any).enrollmentData) {
      return (window as any).enrollmentData;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting enrollment data:', error);
    return null;
  }
}

export function clearEnrollmentData() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('enrollmentData');
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('enrollmentData');
    }
    if ((window as any).enrollmentData) {
      delete (window as any).enrollmentData;
    }
  } catch (error) {
    console.error('Error clearing enrollment data:', error);
  }
}

export function debugStorage() {
  console.log('=== STORAGE DEBUG ===');
  console.log('localStorage available:', typeof localStorage !== 'undefined');
  console.log('sessionStorage available:', typeof sessionStorage !== 'undefined');
  console.log('localStorage:', localStorage);
  console.log('sessionStorage:', sessionStorage);
  
  // Test storage
  try {
    localStorage.setItem('test', 'value');
    console.log('localStorage test:', localStorage.getItem('test'));
    localStorage.removeItem('test');
  } catch (e) {
    console.log('localStorage error:', e);
  }
  
  try {
    sessionStorage.setItem('test', 'value');
    console.log('sessionStorage test:', sessionStorage.getItem('test'));
    sessionStorage.removeItem('test');
  } catch (e) {
    console.log('sessionStorage error:', e);
  }
}

// URL-based data passing as fallback
export function navigateToRegistrationWithData(enrollmentData: any, navigate: (path: string) => void) {
  const params = new URLSearchParams({
    email: enrollmentData.email || '',
    firstName: enrollmentData.firstName || '',
    lastName: enrollmentData.lastName || '',
    phone: enrollmentData.phone || ''
  });
  
  navigate(`/registration?${params.toString()}`);
}

export function getEnrollmentDataFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  return {
    email: urlParams.get('email'),
    firstName: urlParams.get('firstName'),
    lastName: urlParams.get('lastName'),
    phone: urlParams.get('phone'),
    password: 'TempPassword123!' // You'll need to handle this differently
  };
}

export function debugStorage() {
  console.log('=== STORAGE DEBUG ===');
  console.log('localStorage available:', typeof localStorage !== 'undefined');
  console.log('sessionStorage available:', typeof sessionStorage !== 'undefined');
  console.log('localStorage:', localStorage);
  console.log('sessionStorage:', sessionStorage);
  
  // Test storage
  try {
    localStorage.setItem('test', 'value');
    console.log('localStorage test:', localStorage.getItem('test'));
    localStorage.removeItem('test');
  } catch (e) {
    console.log('localStorage error:', e);
  }
  
  try {
    sessionStorage.setItem('test', 'value');
    console.log('sessionStorage test:', sessionStorage.getItem('test'));
    sessionStorage.removeItem('test');
  } catch (e) {
    console.log('sessionStorage error:', e);
  }
}
