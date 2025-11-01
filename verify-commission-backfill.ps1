# Verify Commission Backfill
# This script checks that all test enrollments now have commissions

Write-Host "Verifying Commission Backfill..." -ForegroundColor Cyan
Write-Host ""

# Create verification queries
$queries = @"
-- Query 1: Overall Summary
SELECT 
    COUNT(DISTINCT u.id) as total_members_with_agents,
    COUNT(DISTINCT ac.member_id) as members_with_commissions,
    COUNT(DISTINCT u.id) - COUNT(DISTINCT ac.member_id) as still_missing,
    COALESCE(SUM(ac.amount), 0) as total_commission_amount
FROM users u
LEFT JOIN agent_commissions ac ON ac.member_id = u.id::text
WHERE u.enrolled_by_agent_id IS NOT NULL
  AND u.role = 'member';

-- Query 2: By Agent Breakdown
SELECT 
    agent.email as agent_email,
    COUNT(DISTINCT u.id) as total_enrollments,
    COUNT(DISTINCT ac.id) as commissions_created,
    COALESCE(SUM(ac.amount), 0) as total_amount,
    CASE 
        WHEN COUNT(DISTINCT u.id) = COUNT(DISTINCT ac.id) THEN '✅ Complete'
        ELSE '❌ Missing ' || (COUNT(DISTINCT u.id) - COUNT(DISTINCT ac.id))::text
    END as status
FROM users u
JOIN users agent ON u.enrolled_by_agent_id = agent.id::text
LEFT JOIN agent_commissions ac ON ac.member_id = u.id::text
WHERE u.role = 'member'
GROUP BY agent.email
ORDER BY agent.email;

-- Query 3: Recent Commissions (last 24 hours)
SELECT 
    ac.id,
    agent.email as agent_email,
    member.email as member_email,
    ac.amount,
    ac.status,
    ac.commission_type,
    ac.created_at
FROM agent_commissions ac
JOIN users agent ON ac.agent_id = agent.id::text
JOIN users member ON ac.member_id = member.id::text
WHERE ac.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY ac.created_at DESC
LIMIT 20;

-- Query 4: Any Still Missing?
SELECT 
    u.id as member_id,
    u.email as member_email,
    u.enrolled_by_agent_id,
    agent.email as agent_email,
    u.created_at as enrollment_date,
    '❌ MISSING COMMISSION' as status
FROM users u
JOIN users agent ON u.enrolled_by_agent_id = agent.id::text
LEFT JOIN agent_commissions ac ON ac.member_id = u.id::text
WHERE u.enrolled_by_agent_id IS NOT NULL
  AND u.role = 'member'
  AND ac.id IS NULL
ORDER BY u.created_at DESC;
"@

Write-Host "📋 Copy these queries to run in Supabase SQL Editor:" -ForegroundColor Yellow
Write-Host ""
Write-Host $queries -ForegroundColor White
Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ EXPECTED RESULTS:" -ForegroundColor Green
Write-Host ""
Write-Host "Query 1 (Overall Summary):" -ForegroundColor Yellow
Write-Host "  - still_missing should be 0" -ForegroundColor White
Write-Host "  - total_commission_amount should match expected total" -ForegroundColor White
Write-Host ""
Write-Host "Query 2 (By Agent):" -ForegroundColor Yellow
Write-Host "  - status should show '✅ Complete' for all agents" -ForegroundColor White
Write-Host "  - enrollments count should match commissions count" -ForegroundColor White
Write-Host ""
Write-Host "Query 3 (Recent Commissions):" -ForegroundColor Yellow
Write-Host "  - Should show newly backfilled commissions" -ForegroundColor White
Write-Host "  - Check amounts are correct ($25 default or plan rate)" -ForegroundColor White
Write-Host ""
Write-Host "Query 4 (Still Missing):" -ForegroundColor Yellow
Write-Host "  - Should return NO ROWS (empty result)" -ForegroundColor White
Write-Host ""
Write-Host "=" * 80 -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 TIP: After running the queries, check agent dashboard:" -ForegroundColor Cyan
Write-Host "   1. Login as mkeener@lonestarenotary.com" -ForegroundColor White
Write-Host "   2. Go to https://getmydpcenrollment-production.up.railway.app/agent/dashboard" -ForegroundColor White
Write-Host "   3. Verify all test enrollments show with commissions" -ForegroundColor White
Write-Host ""
