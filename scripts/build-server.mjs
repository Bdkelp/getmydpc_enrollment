import { build } from 'esbuild';

async function runBuild() {
  try {
    await build({
      entryPoints: ['server/index.ts'],
      platform: 'node',
      packages: 'external',
      bundle: true,
      format: 'esm',
      outdir: 'dist',
    });
    console.log('[build:server] Server bundle created successfully');
  } catch (error) {
    console.error('[build:server] Failed to bundle server', error);
    process.exit(1);
  }
}

runBuild();
