
#!/bin/bash
echo "=== Replit Node/React/Vite Health Check ==="

# 1. Clear caches
echo "[*] Clearing caches..."
rm -rf node_modules .pnpm-store .yarn .vite dist .parcel-cache

# 2. Reinstall dependencies
echo "[*] Installing fresh dependencies..."
if [ -f package-lock.json ]; then
  npm ci
elif [ -f pnpm-lock.yaml ]; then
  pnpm install --frozen-lockfile
elif [ -f yarn.lock ]; then
  yarn install --frozen-lockfile
else
  npm install
fi

# 3. Verify scripts
echo "[*] Checking package.json scripts..."
node -e "
const fs=require('fs');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
['dev','build','preview'].forEach(s=>{
  if(!pkg.scripts[s]) console.warn('Missing script:',s)
});
"

# 4. Verify host/port binding
echo "[*] Ensuring .replit uses correct run command..."
grep -q '0.0.0.0' .replit || echo '⚠️ .replit run= line does not bind 0.0.0.0'
grep -q '\$PORT' .replit || echo '⚠️ .replit run= line does not use $PORT'

# 5. Check Node version
echo "[*] Node version in use:"
node -v

# 6. Warn if missing env
echo "[*] Checking VITE_ env vars..."
grep -R "import.meta.env.VITE_" client/src || echo "No VITE_ vars detected in code."

echo "[*] Health check complete!"
