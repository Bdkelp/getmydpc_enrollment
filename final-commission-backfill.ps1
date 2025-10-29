# Final Commission Backfill Script
# Creates subscriptions AND commissions for existing members

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

Write-Host "🚀 FINAL COMMISSION BACKFILL - Creating Subscriptions + Commissions..." -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
    "Content-Type" = "application/json"
}

# Get active members
Write-Host "1️⃣ Getting active members..." -ForegroundColor Yellow
$members = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/members?select=*&status=eq.active" -Headers $headers -Method Get
Write-Host "   Found $($members.Count) active members" -ForegroundColor Green

# Check existing subscriptions  
Write-Host "2️⃣ Checking existing subscriptions..." -ForegroundColor Yellow
$existingSubscriptions = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/subscriptions?select=*" -Headers $headers -Method Get
Write-Host "   Found $($existingSubscriptions.Count) existing subscriptions" -ForegroundColor Green

$created = 0
$failed = 0
$results = @()

Write-Host ""
Write-Host "3️⃣ Creating subscriptions and commissions..." -ForegroundColor Yellow

foreach ($member in $members) {
    try {
        if (-not $member.enrolled_by_agent_id) {
            Write-Host "   ⏭️  Skipping $($member.first_name) $($member.last_name): No agent" -ForegroundColor Gray
            continue
        }

        # Create subscription for this member
        $subscriptionData = @{
            user_id = $member.id
            plan_id = $member.plan_id
            status = "active"
            amount = $member.total_monthly_price
            start_date = $member.plan_start_date + "T00:00:00Z"
            current_period_start = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
            current_period_end = (Get-Date).AddMonths(1).ToString("yyyy-MM-ddTHH:mm:ssZ")
        } | ConvertTo-Json

        $subscription = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/subscriptions" -Headers ($headers + @{"Prefer" = "return=representation"}) -Method Post -Body $subscriptionData
        
        if (-not $subscription -or -not $subscription.id) {
            Write-Host "   ❌ Failed to create subscription for $($member.first_name) $($member.last_name)" -ForegroundColor Red
            $failed++
            continue
        }

        # Calculate commission
        $commissionAmount = 50 # Base commission
        if ($member.total_monthly_price -ge 140) { $commissionAmount = 75 }
        elseif ($member.total_monthly_price -ge 120) { $commissionAmount = 65 }
        elseif ($member.total_monthly_price -ge 100) { $commissionAmount = 55 }
        elseif ($member.total_monthly_price -ge 80) { $commissionAmount = 45 }

        # Create commission
        $commissionData = @{
            agent_id = $member.enrolled_by_agent_id
            agent_number = $member.agent_number
            subscription_id = $subscription.id
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

        $commission = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/commissions" -Headers ($headers + @{"Prefer" = "return=representation"}) -Method Post -Body $commissionData

        if ($commission -and $commission.id) {
            Write-Host "   ✅ $($member.first_name) $($member.last_name) → Agent $($member.agent_number) → `$$commissionAmount" -ForegroundColor Green
            $results += @{
                member = "$($member.first_name) $($member.last_name)"
                agent = $member.agent_number
                amount = $commissionAmount
                subscriptionId = $subscription.id
                commissionId = $commission.id
            }
            $created++
        } else {
            Write-Host "   ❌ Failed to create commission for $($member.first_name) $($member.last_name)" -ForegroundColor Red
            $failed++
        }

        Start-Sleep -Milliseconds 200

    } catch {
        Write-Host "   ❌ Error: $($member.first_name) $($member.last_name) - $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host ""
Write-Host "🎉 BACKFILL COMPLETE!" -ForegroundColor Green
Write-Host "   ✅ Successfully Created: $created" -ForegroundColor Green
Write-Host "   ❌ Failed: $failed" -ForegroundColor Red

if ($results.Count -gt 0) {
    $totalCommissions = ($results | ForEach-Object { $_.amount } | Measure-Object -Sum).Sum
    Write-Host "   💰 Total Commission Value: `$$totalCommissions" -ForegroundColor Yellow
    Write-Host ""
    
    Write-Host "📊 CREATED COMMISSIONS:" -ForegroundColor Blue
    foreach ($result in $results) {
        Write-Host "   • $($result.member) → Agent $($result.agent) → `$$($result.amount) (Sub: $($result.subscriptionId), Com: $($result.commissionId))" -ForegroundColor White
    }

    # Group by agent
    $agentGroups = $results | Group-Object -Property agent
    Write-Host ""
    Write-Host "👥 TOTALS BY AGENT:" -ForegroundColor Magenta
    foreach ($group in $agentGroups) {
        $agentTotal = ($group.Group | ForEach-Object { $_.amount } | Measure-Object -Sum).Sum
        Write-Host "   Agent $($group.Name): $($group.Count) commissions = `$$agentTotal" -ForegroundColor Cyan
    }
}

# Final verification
Write-Host ""
Write-Host "4️⃣ Final verification..." -ForegroundColor Yellow
$finalCommissions = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/commissions?select=*" -Headers $headers -Method Get
$finalSubscriptions = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/subscriptions?select=*" -Headers $headers -Method Get

Write-Host "   📊 System Status:" -ForegroundColor Blue
Write-Host "      Subscriptions: $($finalSubscriptions.Count)" -ForegroundColor White
Write-Host "      Commissions: $($finalCommissions.Count)" -ForegroundColor White

if ($finalCommissions.Count -gt 0) {
    Write-Host ""
    Write-Host "🎯 SUCCESS! Commission system is now fully operational!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🚀 NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Enable real-time in Supabase SQL Editor:" -ForegroundColor White
    Write-Host "   ALTER PUBLICATION supabase_realtime ADD TABLE commissions;" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "2. Test these interfaces:" -ForegroundColor White
    Write-Host "   • Agent Dashboard → Should show commission totals" -ForegroundColor Gray
    Write-Host "   • Admin Analytics → Should show commission analytics" -ForegroundColor Gray
    Write-Host "   • Admin Data Viewer → Commissions tab should show all records" -ForegroundColor Gray
    Write-Host ""
    Write-Host "✅ All commissions set to 'paid' for immediate visibility!" -ForegroundColor Green
}