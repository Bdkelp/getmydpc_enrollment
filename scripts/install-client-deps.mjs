import { spawnSync } from 'node:child_process';

const env = {
  ...process.env,
  NODE_ENV: 'development',
  npm_config_production: 'false',
  npm_config_include: 'prod,dev'
};

const result = spawnSync('npm', ['--prefix', 'client', 'ci'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error('[build:clean] Failed to install client dependencies:', result.error.message);
}

process.exit(result.status ?? 1);
