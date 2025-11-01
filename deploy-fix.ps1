# Deploy storage.ts import fix to Railway
Write-Host "=" -ForegroundColor Cyan
Write-Host "Deploying storage.ts import fix..." -ForegroundColor Cyan
Write-Host "=" -ForegroundColor Cyan

# Check git status
Write-Host "`nChecking git status..." -ForegroundColor Yellow
git status

# Add the changed file
Write-Host "`nStaging storage.ts..." -ForegroundColor Yellow
git add server/storage.ts

# Commit
Write-Host "`nCommitting fix..." -ForegroundColor Yellow
git commit -m "fix: correct neonDb import path in storage.ts

- Changed import from './lib/db' to './lib/neonDb'
- Fixes 'query is not defined' error
- Restores legacy storage functions for dashboard"

# Push to trigger Railway deployment
Write-Host "`nPushing to trigger Railway deployment..." -ForegroundColor Yellow
git push

Write-Host "`n" -ForegroundColor Green
Write-Host "Deployment triggered! Railway will rebuild in ~2-3 minutes." -ForegroundColor Green
Write-Host "Monitor at: https://railway.app/" -ForegroundColor Cyan
