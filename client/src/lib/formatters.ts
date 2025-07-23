// Format phone number as user types
export function formatPhoneNumber(value: string): string {
  // Remove all non-numeric characters
  const cleaned = value.replace(/\D/g, '');
  
  // Limit to 11 digits (1 + 10 digit US number)
  const truncated = cleaned.slice(0, 11);
  
  // Format based on length
  if (truncated.length === 0) {
    return '';
  } else if (truncated.length <= 3) {
    return `(${truncated}`;
  } else if (truncated.length <= 6) {
    return `(${truncated.slice(0, 3)}) ${truncated.slice(3)}`;
  } else if (truncated.length <= 10) {
    return `(${truncated.slice(0, 3)}) ${truncated.slice(3, 6)}-${truncated.slice(6)}`;
  } else {
    // 11 digits - assume country code 1
    return `+1 (${truncated.slice(1, 4)}) ${truncated.slice(4, 7)}-${truncated.slice(7)}`;
  }
}

// Clean phone number for submission (remove formatting)
export function cleanPhoneNumber(value: string): string {
  return value.replace(/\D/g, '');
}

// Format date to MM/DD/YYYY
export function formatDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  
  return `${month}/${day}/${year}`;
}

// Format SSN with dashes
export function formatSSN(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  const truncated = cleaned.slice(0, 9);
  
  if (truncated.length <= 3) {
    return truncated;
  } else if (truncated.length <= 5) {
    return `${truncated.slice(0, 3)}-${truncated.slice(3)}`;
  } else {
    return `${truncated.slice(0, 3)}-${truncated.slice(3, 5)}-${truncated.slice(5)}`;
  }
}

// Clean SSN for submission
export function cleanSSN(value: string): string {
  return value.replace(/\D/g, '');
}

// Format ZIP code
export function formatZipCode(value: string): string {
  const cleaned = value.replace(/\D/g, '');
  const truncated = cleaned.slice(0, 9);
  
  if (truncated.length <= 5) {
    return truncated;
  } else {
    return `${truncated.slice(0, 5)}-${truncated.slice(5)}`;
  }
}