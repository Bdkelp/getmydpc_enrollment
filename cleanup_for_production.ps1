# Production Cleanup Script
# Removes non-essential development files before Digital Ocean deployment

Write-Host "🧹 Starting Production Cleanup..." -ForegroundColor Cyan

# Track what we're removing
$removedFiles = @()
$keptFiles = @()

# ============================================================
# 1. REMOVE DEBUG/TEST SCRIPTS (.js, .mjs, .cjs)
# ============================================================
Write-Host "`n📂 Removing debug and test scripts..." -ForegroundColor Yellow

$testScripts = @(
    "apply_sql_migration.js",
    "check_admin_user.js",
    "clear_all_data.js",
    "clear_production_data.js",
    "clear_production_prep.js",
    "clear_test_data.js",
    "compare_schemas.js",
    "debug-auth-flow.js",
    "debug_members_and_leads.js",
    "deployment-status-check.js",
    "migrate_schema_changes.js",
    "run_cleanup.js",
    "test-auth.js",
    "test-deployment.js",
    "test-fixes.js",
    "test-railway-connection.js",
    "test-role-update.js",
    "test-supabase-auth.js",
    "test-supabase-connection.js",
    "test-supabase-connection-deno-style.js",
    "verify_cleanup_preview.js",
    "verify_ricky_enrollment.js",
    "verify_supabase_changes.js",
    "add_confirmation_columns.mjs",
    "apply_commission_fix.mjs",
    "apply_subscription_fix.mjs",
    "assign_missing_plan_ids.mjs",
    "assign_tara.mjs",
    "backfill_commissions.mjs",
    "backfill_commissions_final.mjs",
    "backfill_commissions_simple.mjs",
    "check-admin-users.mjs",
    "check-commissions-schema.mjs",
    "check-member.mjs",
    "check-plans-schema.mjs",
    "check-supabase-schema.cjs",
    "check-users-schema.mjs",
    "check_agent.mjs",
    "check_agent_commissions.mjs",
    "check_agent_enrollments.mjs",
    "check_agent_location.mjs",
    "check_all_data.mjs",
    "check_and_create_super_admin.mjs",
    "check_commissions_schema.mjs",
    "check_commission_schema.mjs",
    "check_commission_schema_detailed.mjs",
    "check_commission_tracking.cjs",
    "check_commission_triggers.mjs",
    "check_dashboard_data.mjs",
    "check_data_types.mjs",
    "check_latest_member.mjs",
    "check_leads_schema.mjs",
    "check_members_schema.mjs",
    "check_members_schema_quick.mjs",
    "check_michael_account.mjs",
    "check_neon_data.mjs",
    "check_services.mjs",
    "check_subscriptions.mjs",
    "check_subscription_constraint.mjs",
    "check_tables_schema.mjs",
    "check_triggers.mjs",
    "check_tylara_jones.mjs",
    "check_user_storage.mjs",
    "clear-test-member.mjs",
    "consolidate_michael_account.mjs",
    "convert_member_id_to_integer.mjs",
    "create_missing_commissions.mjs",
    "create_missing_commissions_final.mjs",
    "diagnose_commissions.mjs",
    "diagnose_full_data_flow.mjs",
    "diagnose_plan_mapping.mjs",
    "export_database.cjs",
    "find_agent.mjs",
    "find_commission_agent.mjs",
    "fix-plans-table.mjs",
    "fix_commissions_schema.mjs",
    "fix_commission_amounts.mjs",
    "fix_customer_number_column.mjs",
    "fix_schema_for_members.mjs",
    "fix_sequence.cjs",
    "list-agents.mjs",
    "recalculate_commissions.mjs",
    "run-members-migration.mjs",
    "run-remove-ssn-constraint.mjs",
    "run-ssn-fix.mjs",
    "run_enrollment_test.mjs",
    "scan-supabase-queries.cjs",
    "seed-plans.mjs",
    "show_investigation_summary.mjs",
    "sync_plans_from_supabase.mjs",
    "test-plan-insert.mjs",
    "test_agent_stats.mjs",
    "test_analytics.mjs",
    "test_commission_api_transformation.mjs",
    "test_commission_data_structure.mjs",
    "test_commission_endpoints.mjs",
    "test_create_lead_function.mjs",
    "test_dashboard_final.mjs",
    "test_dashboard_fixes.mjs",
    "test_enrollment_commission.mjs",
    "test_enrollment_with_logging.mjs",
    "test_fixed_stub_functions.mjs",
    "test_lead_admin_features.mjs",
    "test_lead_creation.mjs",
    "test_lead_form.mjs",
    "test_lead_status_update.mjs",
    "test_minimal_lead.mjs",
    "update_customer_numbers.mjs",
    "verify-current-state.cjs",
    "verify-database-supabase.cjs",
    "verify_michael_agent_id.mjs",
    "verify_ricky_enrollment.cjs"
)

# KEEP ESSENTIAL SCRIPTS
$keepScripts = @(
    "run_epx_recurring_migration.mjs",  # EPX Server Post migration
    "test_epx_server_post.mjs"         # EPX validation
)

foreach ($script in $testScripts) {
    if (Test-Path $script) {
        Remove-Item $script -Force
        $removedFiles += $script
        Write-Host "  ❌ Removed: $script" -ForegroundColor Red
    }
}

foreach ($script in $keepScripts) {
    if (Test-Path $script) {
        $keptFiles += $script
        Write-Host "  ✅ Kept (essential): $script" -ForegroundColor Green
    }
}

# ============================================================
# 2. REMOVE OLD DOCUMENTATION FILES
# ============================================================
Write-Host "`n📄 Removing old documentation files..." -ForegroundColor Yellow

$oldDocs = @(
    "ADMIN_ACCESS_GUIDE.md",
    "ADMIN_AGENT_DASHBOARD_FIX.md",
    "ADMIN_USER_MANAGEMENT_FIX.md",
    "ANALYTICS_FIX_COMPLETE.md",
    "AUTO_AGENT_NUMBER_SYSTEM.md",
    "CLEANUP_RECOMMENDATION.md",
    "CODE_AUDIT_REPORT.md",
    "COMMISSION_DISPLAY_FIX.md",
    "COMMISSION_FIX_COMPLETE.md",
    "COMMISSION_INVESTIGATION.md",
    "COMMISSION_PAGE_FIX.md",
    "COMMISSION_TRACKING_FIX.md",
    "COMMISSION_TRACKING_FIX_COMPLETE.md",
    "COMPLETE_FIX_SUMMARY.md",
    "CONFIRMATION_PAGE_FIX.md",
    "CRM_API_INTEGRATION_DESIGN.md",
    "CRM_INTEGRATION_EXAMPLE.md",
    "CURRENT_STATUS.md",
    "DASHBOARD_FIX_SUMMARY.md",
    "DEPLOYMENT_GETMYDPC.md",
    "FEATURE_PLAN_LEADS_APPOINTMENTS.md",
    "FIELD_MAPPING_ANALYSIS.md",
    "fix_analytics_function.md",
    "FRESH_SUPABASE_SETUP.md",
    "FRONTEND_FIX_APPLIED.md",
    "FUTURE_FEATURES_ROADMAP.md",
    "HOSTING_COST_COMPARISON.md",
    "IMPACT_ANALYSIS.md",
    "LEAD_FORM_DATABASE_FIX.md",
    "LEAD_FORM_FIX.md",
    "LEAD_FORM_FIX_COMPLETE.md",
    "LEAD_FORM_READY.md",
    "LEAD_MANAGEMENT_READY.md",
    "MEMBER_SEPARATION_PROGRESS.md",
    "MOBILE_RESPONSIVE_ANALYSIS.md",
    "REPLIT_REMOVAL_PLAN.md",
    "ROUTES_UPDATE_GUIDE.md",
    "SCALING_ROADMAP.md",
    "SESSION_COMPLETE_SUMMARY.md",
    "STUB_FUNCTIONS_FIXED.md",
    "SUPABASE_SCHEMA_AUDIT.md",
    "SUPABASE_UPDATE_URLS.md",
    "TROUBLESHOOTING_LOGIN.md",
    "UPDATED_ROUTES_REFERENCE.ts",
    "FIX_STUB_FUNCTIONS.md"
)

# KEEP ESSENTIAL DOCS
$keepDocs = @(
    "COMMISSION_STRUCTURE.md",           # Commission rates reference
    "DEPLOYMENT_CHECKLIST.md",           # Deployment guide
    "DEPLOYMENT_GUIDE.md",               # General deployment
    "DIGITAL_OCEAN_DEPLOYMENT_GUIDE.md", # Digital Ocean specific
    "EPX_INTEGRATION_STATUS.md",         # EPX Server Post status
    "EPX_SERVER_POST_IMPLEMENTATION.md", # EPX technical docs
    "IMPLEMENTATION_COMPLETE.md",        # Recent implementation summary
    "PRODUCTION_CHECKLIST.md",           # Production readiness
    "PRODUCTION_READINESS_ROADMAP.md",   # Production roadmap
    "README.md",                          # Main documentation (if exists)
    "SECURITY_HIPAA_COMPLIANCE.md",      # Security requirements
    "TEST_ACCOUNTS.md"                   # Test credentials
)

foreach ($doc in $oldDocs) {
    if (Test-Path $doc) {
        Remove-Item $doc -Force
        $removedFiles += $doc
        Write-Host "  ❌ Removed: $doc" -ForegroundColor Red
    }
}

foreach ($doc in $keepDocs) {
    if (Test-Path $doc) {
        $keptFiles += $doc
        Write-Host "  ✅ Kept (essential): $doc" -ForegroundColor Green
    }
}

# ============================================================
# 3. REMOVE OLD SQL MIGRATION FILES (keep fresh ones)
# ============================================================
Write-Host "`n🗄️  Removing old SQL migration files..." -ForegroundColor Yellow

$oldSql = @(
    "add_confirmation_columns.sql",
    "add_missing_foreign_key_indexes.sql",
    "add_missing_leads_columns.sql",
    "add_missing_plans_columns.sql",
    "admin_commission_safety_trigger.sql",
    "agent_commission_protection.sql",
    "check_db.sql",
    "check_leads_table.sql",
    "clean_all_test_data_production.sql",
    "clean_core_schema.sql",
    "clean_enrollment_data_only.sql",
    "clean_test_data_keep_last_20.sql",
    "clear_production_data.sql",
    "clear_test_data.sql",
    "commission_rls_policies.sql",
    "create_app_leads_view.sql",
    "create_login_sessions_table.sql",
    "create_members_table.sql",
    "enable_realtime_supabase.sql",
    "enable_rls.sql",
    "ensure_complete_rls.sql",
    "fix_all_rls_comprehensive.sql",
    "fix_commission_rls_policies.sql",
    "fix_commission_trigger.sql",
    "fix_leads_policies.sql",
    "fix_leads_rls_policies.sql",
    "fix_leads_table.sql",
    "fix_missing_rls_policies.sql",
    "fix_missing_rls_policies_complete.sql",
    "fix_plans_name_length.sql",
    "fix_plans_text_columns.sql",
    "fix_rls_performance_issues.sql",
    "fix_rls_policies_snake_case.sql",
    "fix_ssn_column.sql",
    "fix_subscriptions_for_members.sql",
    "fix_subscriptions_sequence.sql",
    "fix_supabase_linter_warnings.sql",
    "fix_users_rls_recursion.sql",
    "fresh_start_migration.sql",
    "migrate_to_members_table.sql",
    "optimize_frequently_used_queries.sql",
    "protect_agent_numbers.sql",
    "recheck_rls_status.sql",
    "remove_admin_commission_trigger.sql",
    "remove_ssn_constraint.sql",
    "remove_unused_indexes.sql",
    "supabase_schema.sql",
    "supabase_security_setup.sql",
    "supabase_user_status_update.sql",
    "test_lead_insert.sql",
    "test_rls_fixes.sql",
    "verify_before_cleanup.sql",
    "verify_current_members.sql",
    "verify_linter_fixes.sql",
    "verify_member_data.sql",
    "verify_migration_results.sql",
    "verify_performance_fixes.sql",
    "verify_rls_comprehensive.sql",
    "verify_rls_policy_fixes.sql"
)

# Note: migrations/ folder contains organized migrations - keep it
foreach ($sql in $oldSql) {
    if (Test-Path $sql) {
        Remove-Item $sql -Force
        $removedFiles += $sql
        Write-Host "  ❌ Removed: $sql" -ForegroundColor Red
    }
}

Write-Host "  ✅ Kept: migrations/ folder (organized migrations)" -ForegroundColor Green
$keptFiles += "migrations/"

# ============================================================
# 4. REMOVE MISC NON-ESSENTIAL FILES
# ============================================================
Write-Host "`n🗑️  Removing miscellaneous files..." -ForegroundColor Yellow

$miscFiles = @(
    ".replit",
    "cleanup.ps1",
    "cookies.txt",
    "found-queries.json",
    "health-check.sh",
    "postcss.config.js.backup",
    "railway.json",
    "server-log.txt",
    "SECRET",
    "SECRETS",
    "test-registration.ps1",
    "vercel.json",
    "components.json"
)

foreach ($file in $miscFiles) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        $removedFiles += $file
        Write-Host "  ❌ Removed: $file" -ForegroundColor Red
    }
}

# ============================================================
# 5. SUMMARY
# ============================================================
Write-Host "`n✅ CLEANUP COMPLETE!" -ForegroundColor Green
Write-Host "`n📊 Summary:" -ForegroundColor Cyan
Write-Host "  Removed: $($removedFiles.Count) files" -ForegroundColor Red
Write-Host "  Kept: $($keptFiles.Count) essential files" -ForegroundColor Green

Write-Host "`n📦 Essential files preserved:" -ForegroundColor Cyan
Write-Host "  ✅ run_epx_recurring_migration.mjs - EPX migration" -ForegroundColor Green
Write-Host "  ✅ test_epx_server_post.mjs - EPX validation" -ForegroundColor Green
Write-Host "  ✅ migrations/ - Database migrations" -ForegroundColor Green
Write-Host "  ✅ Essential documentation files" -ForegroundColor Green
Write-Host "  ✅ .env.example - Configuration template" -ForegroundColor Green

Write-Host "`n🚀 Next Steps for Digital Ocean Deployment:" -ForegroundColor Yellow
Write-Host "  1. Review DIGITAL_OCEAN_DEPLOYMENT_GUIDE.md" -ForegroundColor White
Write-Host "  2. Commit cleaned codebase to git" -ForegroundColor White
Write-Host "  3. Set up Digital Ocean App Platform" -ForegroundColor White
Write-Host "  4. Configure environment variables" -ForegroundColor White
Write-Host "  5. Deploy and get static IP" -ForegroundColor White
Write-Host "  6. Contact EPX to whitelist IP address" -ForegroundColor White
Write-Host "  7. Enable EPX Server Post (set BILLING_SCHEDULER_ENABLED=true)" -ForegroundColor White

Write-Host "`n📋 Deployment readiness: See below for full checklist" -ForegroundColor Cyan
