# Commission Diagnostics Test Script
# Run this after Railway deployment completes

$baseUrl = "https://getmydpcenrollment-production.up.railway.app"

Write-Host "`n=== COMMISSION DIAGNOSTICS TEST ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl`n" -ForegroundColor Gray

# Test 1: Check Plans in Database
Write-Host "1. Checking database plan names..." -ForegroundColor Yellow
try {
    $plansResponse = Invoke-RestMethod -Uri "$baseUrl/api/debug/plans-diagnostic" -Method Get
    Write-Host "   Total Plans: $($plansResponse.totalPlans)" -ForegroundColor Green
    
    foreach ($plan in $plansResponse.plans) {
        $match = if ($plan.matchesBase -or $plan.matchesPlus -or $plan.matchesElite) { "[OK]" } else { "[!!]" }
        $color = if ($plan.matchesBase -or $plan.matchesPlus -or $plan.matchesElite) { "Green" } else { "Red" }
        Write-Host "   $match Plan ID $($plan.id): $($plan.exactName) - Price: `$$($plan.price)" -ForegroundColor $color
    }
    
    if ($plansResponse.warnings.Count -gt 0) {
        Write-Host "`n   WARNINGS:" -ForegroundColor Red
        foreach ($warning in $plansResponse.warnings) {
            Write-Host "   - $warning" -ForegroundColor Red
        }
    } else {
        Write-Host "   [OK] All plan names match calculator expectations!" -ForegroundColor Green
    }
} catch {
    Write-Host "   ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Test Commission Calculations
Write-Host "`n2. Testing commission calculations..." -ForegroundColor Yellow
try {
    $commResponse = Invoke-RestMethod -Uri "$baseUrl/api/debug/commission-diagnostic" -Method Get
    Write-Host "   Test Cases: $($commResponse.testCases)" -ForegroundColor Green
    Write-Host "   Successful: $($commResponse.successful)" -ForegroundColor Green
    Write-Host "   Failed: $($commResponse.failed)" -ForegroundColor $(if ($commResponse.failed -gt 3) { "Red" } else { "Yellow" })
    
    Write-Host "`n   Expected Results:" -ForegroundColor Cyan
    Write-Host "   - Correct plan names (first 9): Should ALL succeed" -ForegroundColor Gray
    Write-Host "   - Incorrect plan names (last 3): Should ALL fail" -ForegroundColor Gray
    
    if ($commResponse.summary.readyForProduction) {
        Write-Host "`n   [OK] READY FOR PRODUCTION - All calculations working correctly!" -ForegroundColor Green
    } else {
        Write-Host "`n   [!!] NOT READY - Some calculations failing" -ForegroundColor Red
        Write-Host "   Check individual test results:" -ForegroundColor Yellow
        
        $commResponse.results | Where-Object { -not $_.success -and $_.input.plan -notlike '*Base' -and $_.input.plan -notlike '*Plus' -and $_.input.plan -ne 'Elite' } | ForEach-Object {
            Write-Host "   FAILED: Plan='$($_.input.plan)', Coverage='$($_.input.coverage)', RxValet=$($_.input.rxValet)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "   ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Check Recent Commissions
Write-Host "`n3. Checking recent commission records..." -ForegroundColor Yellow
try {
    $recentResponse = Invoke-RestMethod -Uri "$baseUrl/api/debug/recent-commissions" -Method Get
    Write-Host "   Total Commissions: $($recentResponse.totalCommissions)" -ForegroundColor Green
    Write-Host "   With New Format: $($recentResponse.formatAnalysis.withNewFormat)" -ForegroundColor Green
    Write-Host "   With Old Format: $($recentResponse.formatAnalysis.withOldFormat)" -ForegroundColor Yellow
    
    if ($recentResponse.totalCommissions -gt 0) {
        Write-Host "`n   Most Recent Commission:" -ForegroundColor Cyan
        $latest = $recentResponse.commissions[0]
        Write-Host "   ID: $($latest.id)" -ForegroundColor Gray
        Write-Host "   Amount: `$$($latest.commissionAmount)" -ForegroundColor Gray
        Write-Host "   Created: $($latest.createdAt)" -ForegroundColor Gray
        Write-Host "   Notes: $($latest.notes)" -ForegroundColor $(if ($latest.hasNewFormat) { "Green" } else { "Yellow" })
        
        if ($latest.hasNewFormat) {
            Write-Host "   [OK] Using new enhanced notes format!" -ForegroundColor Green
        } else {
            Write-Host "   [!!] Using old notes format - will upgrade with next enrollment" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   No commissions found in database yet" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== DIAGNOSTICS COMPLETE ===" -ForegroundColor Cyan
Write-Host ""
