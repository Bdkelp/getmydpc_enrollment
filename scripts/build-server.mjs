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
      define: {
        // Force a string literal in the final bundle so runtime checks work in production
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      },
    });
    console.log('[build:server] Server bundle created successfully');
  } catch (error) {
    console.error('[build:server] Failed to bundle server', error);
    process.exit(1);
  }
}

runBuild();
