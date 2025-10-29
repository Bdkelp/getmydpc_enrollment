# PowerShell Commission Backfill Script
# Creates commissions for all existing members using Supabase REST API

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

Write-Host "🚀 Creating Commissions for All Existing Members..." -ForegroundColor Cyan
Write-Host ""

# Function to create a commission
function New-Commission {
    param (
        [string]$AgentId,
        [string]$AgentNumber,
        [int]$MemberId,
        [string]$PlanName,
        [decimal]$CommissionAmount,
        [decimal]$TotalPlanCost
    )
    
    $commissionData = @{
        agent_id = $AgentId
        agent_number = $AgentNumber
        subscription_id = $null  # Will create later
        user_id = $null
        member_id = $MemberId
        plan_name = $PlanName
        plan_type = "IE"  # Member Only = Individual Equivalent
        plan_tier = $PlanName
        commission_amount = $CommissionAmount
        total_plan_cost = $TotalPlanCost
        status = "active"
        payment_status = "paid"  # Set to paid for immediate visibility in analytics
    } | ConvertTo-Json
    
    $headers = @{
        "apikey" = $supabaseKey
        "Authorization" = "Bearer $supabaseKey"
        "Content-Type" = "application/json"
        "Prefer" = "return=representation"
    }
    
    try {
        $response = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/commissions" -Headers $headers -Method Post -Body $commissionData
        return $response
    }
    catch {
        Write-Host "Error creating commission: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Function to create a subscription
function New-Subscription {
    param (
        [int]$UserId,
        [decimal]$Amount
    )
    
    $subscriptionData = @{
        user_id = $UserId
        plan_id = 1
        status = "active"
        amount = $Amount
        start_date = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        current_period_start = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        current_period_end = (Get-Date).AddMonths(1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    } | ConvertTo-Json
    
    $headers = @{
        "apikey" = $supabaseKey
        "Authorization" = "Bearer $supabaseKey"
        "Content-Type" = "application/json"
        "Prefer" = "return=representation"
    }
    
    try {
        $response = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/subscriptions" -Headers $headers -Method Post -Body $subscriptionData
        return $response
    }
    catch {
        Write-Host "Error creating subscription: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Get all active members
Write-Host "1️⃣ Fetching active members..." -ForegroundColor Yellow
$headers = @{
    "apikey" = $supabaseKey
    "Authorization" = "Bearer $supabaseKey"
}

$members = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/members?select=*&status=eq.active" -Headers $headers -Method Get

Write-Host "   Found $($members.Count) active members" -ForegroundColor Green
Write-Host ""

# Commission calculation (simplified)
function Get-CommissionAmount {
    param ([decimal]$TotalMonthlyPrice)
    
    # Base commission rates based on plan tiers (simplified)
    if ($TotalMonthlyPrice -ge 140) { return 75 }      # Premium plans
    elseif ($TotalMonthlyPrice -ge 100) { return 60 }  # Mid-tier plans  
    elseif ($TotalMonthlyPrice -ge 80) { return 50 }   # Standard plans
    else { return 40 }                                 # Basic plans
}

# Create commissions for each member
Write-Host "2️⃣ Creating commissions..." -ForegroundColor Yellow
$created = 0
$skipped = 0
$totalCommissionValue = 0

foreach ($member in $members) {
    try {
        # Skip if no agent assigned
        if (-not $member.enrolled_by_agent_id) {
            Write-Host "   ⏭️  Skipping $($member.first_name) $($member.last_name): No agent assigned" -ForegroundColor Gray
            $skipped++
            continue
        }
        
        # Calculate commission
        $commissionAmount = Get-CommissionAmount -TotalMonthlyPrice $member.total_monthly_price
        
        # Create subscription first (needed for commission)
        $subscription = New-Subscription -UserId $member.id -Amount $member.total_monthly_price
        if (-not $subscription) {
            Write-Host "   ❌ Failed to create subscription for $($member.first_name) $($member.last_name)" -ForegroundColor Red
            $skipped++
            continue
        }
        
        # Create commission
        $commission = New-Commission -AgentId $member.enrolled_by_agent_id -AgentNumber $member.agent_number -MemberId $member.id -PlanName "MyPremierPlan" -CommissionAmount $commissionAmount -TotalPlanCost $member.total_monthly_price
        
        if ($commission) {
            Write-Host "   ✅ $($member.first_name) $($member.last_name) → Agent $($member.agent_number) → `$$commissionAmount" -ForegroundColor Green
            $created++
            $totalCommissionValue += $commissionAmount
        } else {
            Write-Host "   ❌ Failed to create commission for $($member.first_name) $($member.last_name)" -ForegroundColor Red
            $skipped++
        }
        
        # Small delay to avoid rate limits
        Start-Sleep -Milliseconds 200
        
    } catch {
        Write-Host "   ❌ Error processing $($member.first_name) $($member.last_name): $($_.Exception.Message)" -ForegroundColor Red
        $skipped++
    }
}

Write-Host ""
Write-Host "🎉 COMMISSION BACKFILL COMPLETE!" -ForegroundColor Green
Write-Host "   ✅ Commissions Created: $created" -ForegroundColor Green
Write-Host "   ⏭️  Members Skipped: $skipped" -ForegroundColor Yellow  
Write-Host "   💰 Total Commission Value: `$$totalCommissionValue" -ForegroundColor Cyan
Write-Host ""

# Verify results
Write-Host "3️⃣ Verifying results..." -ForegroundColor Yellow
$finalCommissions = Invoke-RestMethod -Uri "$supabaseUrl/rest/v1/commissions?select=*" -Headers $headers -Method Get

if ($finalCommissions -and $finalCommissions.Count -gt 0) {
    Write-Host "   📊 Final System Status:" -ForegroundColor Blue
    Write-Host "      Total Commissions: $($finalCommissions.Count)" -ForegroundColor White
    
    # Group by agent
    $agentGroups = $finalCommissions | Group-Object -Property agent_number
    Write-Host "      Commission by Agent:" -ForegroundColor White
    foreach ($group in $agentGroups) {
        $agentTotal = ($group.Group | Measure-Object -Property commission_amount -Sum).Sum
        Write-Host "        Agent $($group.Name): $($group.Count) commissions, `$$agentTotal total" -ForegroundColor Cyan
    }
    
    Write-Host ""
    Write-Host "🚀 SUCCESS! Your commission system is now populated with test data!" -ForegroundColor Green
    Write-Host "✅ Agents can now see commissions in their dashboards" -ForegroundColor Green
    Write-Host "✅ Admin can see commission analytics" -ForegroundColor Green
    Write-Host "✅ All commissions are set to 'paid' status for immediate visibility" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 NEXT STEPS:" -ForegroundColor Magenta
    Write-Host "1. Run this SQL in Supabase SQL Editor to enable real-time:" -ForegroundColor White
    Write-Host "   ALTER PUBLICATION supabase_realtime ADD TABLE commissions;" -ForegroundColor Cyan
    Write-Host "2. Test the agent dashboard to see commissions" -ForegroundColor White
    Write-Host "3. Test the admin analytics to see commission data" -ForegroundColor White
    
} else {
    Write-Host "❌ No commissions were created successfully" -ForegroundColor Red
}