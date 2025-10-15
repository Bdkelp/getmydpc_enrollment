# Cleanup script for outdated documentation files
Write-Host "Starting cleanup of outdated files..." -ForegroundColor Cyan
Write-Host ""

$filesToRemove = @(
    "member_user_separation_migration.sql",
    "member_migration_simple.sql",
    "MEMBER_USER_SEPARATION_STATUS.md",
    "MEMBER_USER_SEPARATION_PLAN.md",
    "MEMBER_USER_SEPARATION_ACTION_PLAN.md",
    "DEPLOYMENT_CHECKLIST_MEMBER_SEPARATION.md",
    "MIGRATION_FROM_REPLIT.md",
    "QUICK_SUPABASE_MIGRATION.md",
    "NEON_DATABASE_ACCESS.md",
    "NEON_DATABASE_CONTENTS.md",
    "HOW_TO_ACCESS_NEON_DATABASE.md",
    "TEST_DATA_CLEANUP_GUIDE.md",
    "RUN_CLEANUP_GUIDE.md",
    "READY_TO_EXECUTE.md",
    "EXECUTE_CLEANUP_STEPS.md",
    "DEPLOYMENT_TEST_CHECKLIST.md",
    "CLEAN_START_MIGRATION.md",
    "COMPLETED_ISSUES_1_AND_2_SUMMARY.md",
    "COMMISSION_RATES_FIXED.md",
    "COMMISSION_FIX_INSTRUCTIONS.md",
    "COMMISSION_TRACKING_VERIFICATION.md"
)

$deletedCount = 0
$notFoundCount = 0

foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "Deleted: $file" -ForegroundColor Green
        $deletedCount++
    } else {
        Write-Host "Not found: $file" -ForegroundColor Yellow
        $notFoundCount++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Cleanup complete!" -ForegroundColor Green
Write-Host "Deleted: $deletedCount files" -ForegroundColor Green
Write-Host "Not found: $notFoundCount files" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
