import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const env = {
  ...process.env,
  NODE_ENV: 'development',
};

const args = ['--prefix', 'client', 'ci', '--include=dev'];
const result = spawnSync(npmCommand, args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error('[build:clean] Failed to install client dependencies:', result.error.message);
}

process.exit(result.status ?? 1);
