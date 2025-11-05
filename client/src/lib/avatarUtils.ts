/**
 * Avatar utility functions for default profile images
 */

/**
 * Get a default avatar URL based on user ID or name
 * @param userId - User ID to generate consistent avatar
 * @param userName - Optional user name for additional randomization
 * @returns URL to a default avatar SVG
 */
export function getDefaultAvatar(userId: string, userName?: string): string {
  // Create a simple hash from userId (and optionally userName) for consistent avatar selection
  let hash = 0;
  const str = userId + (userName || '');
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use absolute value and modulo to get a number between 1-6
  const avatarNumber = (Math.abs(hash) % 6) + 1;
  
  return `/avatars/avatar-${avatarNumber}.svg`;
}

/**
 * Get all available default avatars
 * @returns Array of avatar URLs
 */
export function getAllDefaultAvatars(): string[] {
  return [
    '/avatars/avatar-1.svg', // Blue
    '/avatars/avatar-2.svg', // Green
    '/avatars/avatar-3.svg', // Purple
    '/avatars/avatar-4.svg', // Orange
    '/avatars/avatar-5.svg', // Red
    '/avatars/avatar-6.svg', // Cyan
  ];
}

/**
 * Get user initials for fallback display
 * @param fullName - User's full name
 * @param maxInitials - Maximum number of initials to return (default: 2)
 * @returns Initials string (e.g., "JD" for "John Doe")
 */
export function getUserInitials(fullName?: string, maxInitials: number = 2): string {
  if (!fullName) return 'U'; // Default to 'U' for User
  
  const names = fullName.trim().split(' ').filter(name => name.length > 0);
  if (names.length === 0) return 'U';
  
  const initials = names
    .slice(0, maxInitials)
    .map(name => name[0].toUpperCase())
    .join('');
    
  return initials || 'U';
}

/**
 * Get avatar color based on user ID for consistent theming
 * @param userId - User ID
 * @returns Tailwind CSS color class
 */
export function getAvatarColor(userId: string): string {
  const colors = [
    'bg-blue-500',
    'bg-green-500', 
    'bg-purple-500',
    'bg-orange-500',
    'bg-red-500',
    'bg-cyan-500'
  ];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return colors[Math.abs(hash) % colors.length];
}