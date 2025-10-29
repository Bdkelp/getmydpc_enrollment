# PowerShell Script to Check Commission System Status
# This script uses Supabase REST API to check the current state

# Load environment variables from .env file
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

if (-not $supabaseUrl -or -not $supabaseKey) {
    Write-Host "❌ Missing Supabase environment variables" -ForegroundColor Red
    exit 1
}

Write-Host "🔍 Checking Commission System Status..." -ForegroundColor Cyan
Write-Host ""

# Function to make Supabase API calls
function Invoke-SupabaseQuery {
    param (
        [string]$Table,
        [string]$Select = "*",
        [string]$Filter = ""
    )
    
    $url = "$supabaseUrl/rest/v1/$Table"
    if ($Select -ne "*") {
        $url += "?select=$Select"
    }
    if ($Filter) {
        $separator = if ($Select -ne "*") { "&" } else { "?" }
        $url += "$separator$Filter"
    }
    
    $headers = @{
        "apikey" = $supabaseKey
        "Authorization" = "Bearer $supabaseKey"
        "Content-Type" = "application/json"
    }
    
    try {
        $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
        return $response
    }
    catch {
        Write-Host "Error querying $Table : $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# 1. Check members
Write-Host "1️⃣ MEMBERS STATUS:" -ForegroundColor Yellow
$members = Invoke-SupabaseQuery -Table "members" -Select "id,first_name,last_name,status,plan_name,coverage_type,total_monthly_price,enrolled_by_agent_id"

if ($members) {
    $activeMembers = $members | Where-Object { $_.status -eq "active" }
    Write-Host "   Total Members: $($members.Count)" -ForegroundColor White
    Write-Host "   Active Members: $($activeMembers.Count)" -ForegroundColor Green
    Write-Host "   Inactive Members: $($members.Count - $activeMembers.Count)" -ForegroundColor Gray
    Write-Host ""
    
    if ($activeMembers.Count -gt 0) {
        Write-Host "   📋 Active Members:" -ForegroundColor Blue
        for ($i = 0; $i -lt [Math]::Min(10, $activeMembers.Count); $i++) {
            $member = $activeMembers[$i]
            $agentInfo = if ($member.enrolled_by_agent_id) { "Agent: $($member.enrolled_by_agent_id)" } else { "No Agent" }
            Write-Host "     $($i + 1). $($member.first_name) $($member.last_name) - $($member.plan_name) (`$$($member.total_monthly_price)) - $agentInfo" -ForegroundColor White
        }
        if ($activeMembers.Count -gt 10) {
            Write-Host "     ... and $($activeMembers.Count - 10) more" -ForegroundColor Gray
        }
        Write-Host ""
    }
}

# 2. Check agents
Write-Host "2️⃣ AGENTS STATUS:" -ForegroundColor Yellow
$users = Invoke-SupabaseQuery -Table "users" -Select "id,first_name,last_name,agent_number,role,is_active"

if ($users) {
    $activeAgents = $users | Where-Object { $_.role -eq "agent" -and $_.is_active -eq $true }
    $adminUsers = $users | Where-Object { $_.role -eq "admin" }
    
    Write-Host "   Total Users: $($users.Count)" -ForegroundColor White
    Write-Host "   Active Agents: $($activeAgents.Count)" -ForegroundColor Green
    Write-Host "   Admin Users: $($adminUsers.Count)" -ForegroundColor Blue
    Write-Host ""
    
    if ($activeAgents.Count -gt 0) {
        Write-Host "   👥 Active Agents:" -ForegroundColor Blue
        foreach ($agent in $activeAgents) {
            Write-Host "     • $($agent.first_name) $($agent.last_name) - $($agent.agent_number)" -ForegroundColor White
        }
        Write-Host ""
    }
}

# 3. Check subscriptions
Write-Host "3️⃣ SUBSCRIPTIONS STATUS:" -ForegroundColor Yellow
$subscriptions = Invoke-SupabaseQuery -Table "subscriptions" -Select "id,user_id,status,amount"

if ($subscriptions) {
    $activeSubscriptions = $subscriptions | Where-Object { $_.status -eq "active" }
    Write-Host "   Total Subscriptions: $($subscriptions.Count)" -ForegroundColor White
    Write-Host "   Active Subscriptions: $($activeSubscriptions.Count)" -ForegroundColor Green
    Write-Host "   Inactive Subscriptions: $($subscriptions.Count - $activeSubscriptions.Count)" -ForegroundColor Gray
    Write-Host ""
}

# 4. Check commissions - THIS IS THE KEY CHECK
Write-Host "4️⃣ COMMISSIONS STATUS:" -ForegroundColor Yellow
$commissions = Invoke-SupabaseQuery -Table "commissions" -Select "id,agent_id,member_id,user_id,commission_amount,payment_status,status"

if ($commissions -and $commissions.Count -gt 0) {
    $paidCommissions = $commissions | Where-Object { $_.payment_status -eq "paid" }
    $unpaidCommissions = $commissions | Where-Object { $_.payment_status -eq "unpaid" }
    $totalValue = ($commissions | Measure-Object -Property commission_amount -Sum).Sum
    
    Write-Host "   Total Commissions: $($commissions.Count)" -ForegroundColor Green
    Write-Host "   Paid Commissions: $($paidCommissions.Count)" -ForegroundColor Green
    Write-Host "   Unpaid Commissions: $($unpaidCommissions.Count)" -ForegroundColor Yellow
    Write-Host "   Total Commission Value: `$$([Math]::Round($totalValue, 2))" -ForegroundColor Green
    Write-Host ""
    
    Write-Host "   💰 Commission Details:" -ForegroundColor Blue
    for ($i = 0; $i -lt [Math]::Min(10, $commissions.Count); $i++) {
        $comm = $commissions[$i]
        $memberInfo = if ($comm.member_id) { "Member ID: $($comm.member_id)" } else { "User ID: $($comm.user_id)" }
        Write-Host "     $($i + 1). Agent: $($comm.agent_id) → `$$($comm.commission_amount) ($($comm.payment_status)) - $memberInfo" -ForegroundColor White
    }
    if ($commissions.Count -gt 10) {
        Write-Host "     ... and $($commissions.Count - 10) more commissions" -ForegroundColor Gray
    }
    Write-Host ""
} else {
    Write-Host "   ❌ NO COMMISSIONS FOUND - This is the problem!" -ForegroundColor Red
    Write-Host ""
}

# 5. Check for members without commissions
Write-Host "5️⃣ MISSING COMMISSIONS CHECK:" -ForegroundColor Yellow
if ($activeMembers -and $commissions) {
    $memberIds = $activeMembers | ForEach-Object { $_.id }
    $membersWithCommissions = ($commissions | Where-Object { $_.member_id } | ForEach-Object { $_.member_id }) | Sort-Object -Unique
    $membersWithoutCommissions = $memberIds | Where-Object { $_ -notin $membersWithCommissions }
    
    if ($membersWithoutCommissions.Count -eq 0) {
        Write-Host "   ✅ All active members have commissions" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $($membersWithoutCommissions.Count) active members are missing commissions:" -ForegroundColor Red
        foreach ($memberId in $membersWithoutCommissions) {
            $member = $activeMembers | Where-Object { $_.id -eq $memberId }
            if ($member) {
                Write-Host "     - $($member.first_name) $($member.last_name) (ID: $($member.id))" -ForegroundColor White
            }
        }
    }
    Write-Host ""
} elseif ($activeMembers -and (-not $commissions -or $commissions.Count -eq 0)) {
    Write-Host "   ❌ $($activeMembers.Count) active members have NO commissions at all!" -ForegroundColor Red
    Write-Host ""
}

# 6. Summary and recommendations
Write-Host "📊 SUMMARY & RECOMMENDATIONS:" -ForegroundColor Magenta

if (-not $activeMembers -or $activeMembers.Count -eq 0) {
    Write-Host "❌ No active members found - need to create test members" -ForegroundColor Red
} elseif (-not $commissions -or $commissions.Count -eq 0) {
    Write-Host "❌ No commissions found - run backfill script to create commissions for existing members" -ForegroundColor Red
    Write-Host "💡 Recommended action: Run the quick-commission-fix.js script" -ForegroundColor Yellow
    Write-Host "   This will create commissions for all $($activeMembers.Count) active members" -ForegroundColor Cyan
} elseif ($membersWithoutCommissions -and $membersWithoutCommissions.Count -gt 0) {
    Write-Host "❌ $($membersWithoutCommissions.Count) members missing commissions - run backfill script" -ForegroundColor Red
    Write-Host "💡 Recommended action: Run the backfill-commissions.js script" -ForegroundColor Yellow
} else {
    Write-Host "✅ Commission system appears to be working correctly!" -ForegroundColor Green
    Write-Host "✅ All active members have commissions" -ForegroundColor Green
    Write-Host "✅ Commission data is available for testing" -ForegroundColor Green
}

Write-Host ""
Write-Host "🚀 Next Steps:" -ForegroundColor Cyan
Write-Host "1. If no commissions found: Enable Node.js and run 'node server/scripts/quick-commission-fix.js'" -ForegroundColor White
Write-Host "2. Enable real-time: Run 'ALTER PUBLICATION supabase_realtime ADD TABLE commissions;' in Supabase SQL Editor" -ForegroundColor White
Write-Host "3. Test the system: Check agent dashboard and admin analytics for commission data" -ForegroundColor White