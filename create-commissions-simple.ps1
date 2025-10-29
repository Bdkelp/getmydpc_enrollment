# Simplified Commission Creation Script
# Creates commissions directly for existing members

# Load environment variables
$envFile = "f:\getmydpc_enrollment\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^([^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

$supabaseUrl = $env:SUPABASE_URL
$supabaseKey = $env:SUPABASE_SERVICE_ROLE_KEY

Write-Host "💰 Creating Commissions Directly for All Members..." -ForegroundColor Cyan
Write-Host ""

# Get all active members
Write-Host "1️⃣ Fetching active members..." -ForegroundColor Yellow
$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
}

$members = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/members?select=*&status=eq.active" -Headers $headers -Method Get
Write-Host "   Found $($members.Count) active members" -ForegroundColor Green

# Commission calculation based on monthly price
function Get-CommissionAmount {
    param ([decimal]$TotalMonthlyPrice)
    
    if ($TotalMonthlyPrice -ge 140) { return 75 }      # $143+ plans = $75 commission
    elseif ($TotalMonthlyPrice -ge 120) { return 65 }  # $120-139 plans = $65 commission
    elseif ($TotalMonthlyPrice -ge 100) { return 55 }  # $100-119 plans = $55 commission
    elseif ($TotalMonthlyPrice -ge 80) { return 45 }   # $80-99 plans = $45 commission
    else { return 35 }                                 # Under $80 plans = $35 commission
}

Write-Host ""
Write-Host "2️⃣ Creating commissions..." -ForegroundColor Yellow

$created = 0
$failed = 0
$totalCommissionValue = 0
$createdCommissions = @()

foreach ($member in $members) {
    try {
        # Skip if no agent
        if (-not $member.enrolled_by_agent_id) {
            Write-Host "   ⏭️  Skipping $($member.first_name) $($member.last_name): No agent" -ForegroundColor Gray
            continue
        }
        
        $commissionAmount = Get-CommissionAmount -TotalMonthlyPrice $member.total_monthly_price
        
        # Create commission directly (without subscription requirement)
        $commissionData = @{
            agent_id = $member.enrolled_by_agent_id
            agent_number = $member.agent_number
            subscription_id = $null
            user_id = $null
            member_id = $member.id
            plan_name = "MyPremierPlan"
            plan_type = "IE"
            plan_tier = "MyPremierPlan"
            commission_amount = $commissionAmount
            total_plan_cost = $member.total_monthly_price
            status = "active"
            payment_status = "paid"
        } | ConvertTo-Json
        
        $postHeaders = @{
            "apikey" = $supabaseKey
            "Authorization" = "Bearer $supabaseKey"
            "Content-Type" = "application/json"
            "Prefer" = "return=representation"
        }
        
        $response = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/commissions" -Headers $postHeaders -Method Post -Body $commissionData
        
        Write-Host "   ✅ $($member.first_name) $($member.last_name) → Agent $($member.agent_number) → `$$commissionAmount" -ForegroundColor Green
        
        $createdCommissions += @{
            member = "$($member.first_name) $($member.last_name)"
            agent = $member.agent_number
            amount = $commissionAmount
        }
        
        $created++
        $totalCommissionValue += $commissionAmount
        
        # Small delay
        Start-Sleep -Milliseconds 100
        
    } catch {
        Write-Host "   ❌ Failed: $($member.first_name) $($member.last_name) - $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "🎉 COMMISSION CREATION COMPLETE!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 RESULTS:" -ForegroundColor Cyan
Write-Host "   ✅ Commissions Created: $created" -ForegroundColor Green
Write-Host "   ❌ Failed: $failed" -ForegroundColor Red
Write-Host "   💰 Total Commission Value: `$$totalCommissionValue" -ForegroundColor Yellow
Write-Host ""

if ($createdCommissions.Count -gt 0) {
    Write-Host "💰 CREATED COMMISSIONS:" -ForegroundColor Blue
    foreach ($comm in $createdCommissions) {
        Write-Host "   • $($comm.member) → Agent $($comm.agent) → `$$($comm.amount)" -ForegroundColor White
    }
    Write-Host ""
    
    # Group by agent
    $agentGroups = $createdCommissions | Group-Object -Property agent
    Write-Host "👥 TOTALS BY AGENT:" -ForegroundColor Magenta
    foreach ($group in $agentGroups) {
        $agentTotal = ($group.Group | ForEach-Object { $_.amount } | Measure-Object -Sum).Sum
        Write-Host "   Agent $($group.Name): $($group.Count) commissions = `$$agentTotal total" -ForegroundColor Cyan
    }
    Write-Host ""
}

# Verify final results
Write-Host "3️⃣ Verifying final system state..." -ForegroundColor Yellow
$finalCommissions = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/commissions?select=*" -Headers $headers -Method Get

Write-Host "   📊 System now has $($finalCommissions.Count) total commissions" -ForegroundColor Green
Write-Host ""

if ($finalCommissions.Count -gt 0) {
    Write-Host "🚀 SUCCESS! Commission system is now populated!" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Enable real-time updates by running this SQL in Supabase:" -ForegroundColor White
    Write-Host "   ALTER PUBLICATION supabase_realtime ADD TABLE commissions;" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "2. Test these interfaces:" -ForegroundColor White
    Write-Host "   • Agent Dashboard: Should show commission totals" -ForegroundColor Gray
    Write-Host "   • Admin Analytics: Should show commission data" -ForegroundColor Gray  
    Write-Host "   • Admin Data Viewer: Commissions tab should show records" -ForegroundColor Gray
    Write-Host ""
    Write-Host "🎯 All commissions set to 'paid' status for immediate visibility!" -ForegroundColor Green
} else {
    Write-Host "❌ No commissions were successfully created" -ForegroundColor Red
}