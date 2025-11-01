# Cleanup Obsolete Files
# This script removes files that are no longer needed after Neon removal

Write-Host "Cleaning up obsolete files..." -ForegroundColor Cyan

# Files to remove - these are all related to old commission debugging/Neon migration
$filesToRemove = @(
    # Old commission debugging files
    "check-commission-status.ps1",
    "create-commissions.ps1",
    "create-commissions-simple.ps1",
    "final-commission-backfill.ps1",
    "test-commission-fix.js",
    "test-commission-endpoints.js",
    "test-new-commissions.js",
    "test-commission.json",
    "test-database-commission.sql",
    "fix-enrollment-commission.txt",
    
    # Old documentation that's now obsolete
    "COMMISSION_FIX_PLAN.md",
    "COMMISSION_CLEANUP_PLAN.md",
    "COMMISSION_DEBUG_PLAN.md",
    "COMMISSION_IMPLEMENTATION_COMPLETE.md",
    "COMMISSION_REALTIME_FIX.md",
    "CLEAN_COMMISSION_DESIGN.md",
    "SAFE_COMMISSION_MIGRATION.md",
    "MIGRATION_DEPLOYMENT_GUIDE.md",
    "MIGRATION_GUIDE.md",
    
    # Drizzle config (no longer using Neon/Drizzle)
    "drizzle.config.ts",
    
    # Old deployment guides (using Railway now)
    "DIGITAL_OCEAN_DEPLOYMENT_GUIDE.md",
    "DIGITAL_OCEAN_READINESS.md",
    
    # Old production checklists (outdated)
    "COMMISSION_SYSTEM_AUDIT.md",
    "PRODUCTION_READINESS_ROADMAP.md"
)

$removed = 0
$notFound = 0

foreach ($file in $filesToRemove) {
    $fullPath = Join-Path $PSScriptRoot $file
    
    if (Test-Path $fullPath) {
        try {
            Remove-Item $fullPath -Force
            Write-Host "✅ Removed: $file" -ForegroundColor Green
            $removed++
        } catch {
            Write-Host "❌ Failed to remove: $file" -ForegroundColor Red
            Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "⏭️  Not found: $file" -ForegroundColor Yellow
        $notFound++
    }
}

Write-Host "`n📊 Cleanup Summary:" -ForegroundColor Cyan
Write-Host "   Removed: $removed files" -ForegroundColor Green
Write-Host "   Not found: $notFound files" -ForegroundColor Yellow

Write-Host "`n✨ Cleanup complete!" -ForegroundColor Green
Write-Host "The following key files remain:" -ForegroundColor Cyan
Write-Host "  - DEPLOYMENT_CHECKLIST.md (current deployment guide)" -ForegroundColor White
Write-Host "  - RAILWAY_STATIC_IP_GUIDE.md (Railway specific)" -ForegroundColor White
Write-Host "  - SECURITY_HIPAA_COMPLIANCE.md (security requirements)" -ForegroundColor White
Write-Host "  - TEST_ACCOUNTS.md (test credentials)" -ForegroundColor White
Write-Host "  - COMMISSION_STRUCTURE.md (commission business logic)" -ForegroundColor White
Write-Host "  - test-lead-form.ps1 (NEW - test public lead submission)" -ForegroundColor White
