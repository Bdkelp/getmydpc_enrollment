import 'dotenv/config';
import { execSync } from 'child_process';

console.log('🌱 Loading environment and seeding plans...\n');

try {
  execSync('npx tsx server/scripts/seed-plans-supabase.ts', {
    stdio: 'inherit',
    env: process.env
  });
} catch (error) {
  console.error('❌ Seed failed:', error.message);
  process.exit(1);
}
