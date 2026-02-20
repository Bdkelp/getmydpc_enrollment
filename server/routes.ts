// @ts-nocheck - Temporarily disable strict type checking for legacy code
import { Router } from "express";
import { storage } from "./storage";
import { authenticateToken, type AuthRequest } from "./auth/supabaseAuth";
import { hasAtLeastRole } from "./auth/roles";
import { paymentService } from "./services/payment-service";
import {
  calculateCommission,
  getPlanTierFromName,
  getPlanTypeFromMemberType,
  RX_VALET_COMMISSION,
} from "./commissionCalculator"; // FIXED: Using actual commission rates
import { sendLeadSubmissionEmails, sendManualConfirmationEmail, sendPartnerInquiryEmails } from "./utils/notifications";
import { sendEmailVerification, sendUserCredentialsEmail } from "./email";
import { supabase } from "./lib/supabaseClient"; // Use Supabase for everything
import supabaseAuthRoutes from "./routes/supabase-auth";
import { 
  calculateMembershipStartDate, 
  isMembershipActive, 
  daysUntilMembershipStarts 
} from "./utils/membership-dates";
// import epxRoutes from "./routes/epx-routes"; // Browser Post (commented out)
// import epxHostedRoutes from "./routes/epx-hosted-routes"; // Moved to server/index.ts to avoid duplicate registration

const router = Router();

const PERIOD_FILTERS = new Set([
  'today',
  'week',
  'month',
  'quarter',
  'year',
  'last-30',
  'last-90',
  'custom',
  'all-time'
]);

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

function parseDateInput(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function getDateRangeFromQuery(period?: string, customStart?: string, customEnd?: string) {
  const normalizedPeriod = typeof period === 'string' && PERIOD_FILTERS.has(period) ? period : undefined;
  const now = new Date();
  let start: Date | undefined;
  let end: Date | undefined;

  switch (normalizedPeriod) {
    case 'today':
      start = startOfDay(now);
      end = endOfDay(now);
      break;
    case 'week': {
      const temp = startOfDay(now);
      const weekday = temp.getDay();
      temp.setDate(temp.getDate() - weekday);
      start = temp;
      end = endOfDay(now);
      break;
    }
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = endOfDay(now);
      break;
    case 'quarter': {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), quarterStartMonth, 1);
      end = endOfDay(now);
      break;
    }
    case 'year':
      start = new Date(now.getFullYear(), 0, 1);
      end = endOfDay(now);
      break;
    case 'last-30': {
      const temp = new Date(now);
      temp.setDate(temp.getDate() - 30);
      start = startOfDay(temp);
      end = endOfDay(now);
      break;
    }
    case 'last-90': {
      const temp = new Date(now);
      temp.setDate(temp.getDate() - 90);
      start = startOfDay(temp);
      end = endOfDay(now);
      break;
    }
    case 'custom':
      start = parseDateInput(customStart);
      end = parseDateInput(customEnd);
      if (start) start = startOfDay(start);
      if (end) end = endOfDay(end);
      break;
    case 'all-time':
    default:
      start = parseDateInput(customStart);
      end = parseDateInput(customEnd);
      if (start) start = startOfDay(start);
      if (end) end = endOfDay(end);
      break;
  }

  if (start && !end) {
    end = endOfDay(now);
  }

  return { start, end };
}

function filterRecordsByDate(records: any[] = [], start?: Date, end?: Date) {
  if (!start && !end) {
    return records;
  }

  const startMs = start ? start.getTime() : Number.NEGATIVE_INFINITY;
  const endMs = end ? end.getTime() : Number.POSITIVE_INFINITY;

  return records.filter((record) => {
    const timestamp = record?.createdAt || record?.created_at;
    if (!timestamp) return false;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return false;
    const value = date.getTime();
    return value >= startMs && value <= endMs;
  });
}

function sumEnrollmentRevenue(records: any[] = []) {
  return records.reduce((total, enrollment) => {
    const raw = enrollment?.totalMonthlyPrice ?? enrollment?.total_monthly_price ?? enrollment?.planPrice ?? enrollment?.plan_price ?? 0;
    const amount = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (Number.isNaN(amount)) {
      return total;
    }
    return total + amount;
  }, 0);
}

function sumCommissionAmounts(records: any[] = []) {
  return records.reduce((total, commission) => {
    const raw = commission?.commissionAmount ?? commission?.commission_amount ?? 0;
    const amount = typeof raw === 'number' ? raw : parseFloat(String(raw));
    if (Number.isNaN(amount)) {
      return total;
    }
    return total + amount;
  }, 0);
}

// Helper functions leverage centralized role hierarchy
const isAdmin = (role: string | undefined): boolean => {
  return hasAtLeastRole(role, "admin");
};

const isAgentRole = (role: string | undefined): boolean => {
  return role === "agent" || hasAtLeastRole(role, "super_admin");
};

const hasAgentOrAdminAccess = (role: string | undefined): boolean => {
  return role === "agent" || hasAtLeastRole(role, "admin");
};

// Public routes (no authentication required)
router.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Temporary endpoint to check DigitalOcean's outbound IP for EPX ACL whitelist
router.get("/api/check-ip", async (req, res) => {
  try {
    const response = await fetch("https://api.ipify.org?format=json");
    const data = await response.json() as { ip: string };
    res.json({ 
      outboundIP: data.ip,
      timestamp: new Date().toISOString(),
      message: "This is the IP address that DigitalOcean uses for outbound requests (needed for EPX ACL)"
    });
  } catch (error) {
    console.error('[IP Check] Failed to fetch IP:', error);
    res.status(500).json({ 
      error: "Failed to check IP",
      details: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Diagnostic endpoint for CORS testing
router.get("/api/test-cors", (req, res) => {
  const origin = req.headers.origin;
  console.log('[CORS Test] Request from origin:', origin);

  // Set CORS headers
  const allowedOrigins = [
    'https://getmydpc-enrollment-gjk6m.ondigitalocean.app',
    'https://enrollment.getmydpc.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000'
  ];

  if (allowedOrigins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.json({
    status: "CORS test successful",
    timestamp: new Date().toISOString(),
    origin: origin,
    corsAllowed: allowedOrigins.includes(origin as string),
    headers: req.headers
  });
});

// DIAGNOSTIC: Direct database query to check users (NO AUTH - for debugging)
router.get("/api/debug/users-count", async (req, res) => {
  try {
    console.log("[DEBUG] Direct database query for users...");
    const result = await storage.getAllUsers();
    const users = result.users || [];
    
    const roleBreakdown = users.reduce((acc: any, user: any) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    res.json({
      timestamp: new Date().toISOString(),
      totalUsers: users.length,
      roleBreakdown,
      allEmails: users.map((u: any) => ({ email: u.email, role: u.role, isActive: u.isActive })),
      rawCount: result.totalCount
    });
  } catch (error) {
    console.error("[DEBUG] Error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// DIAGNOSTIC: Check Supabase connection details (NO AUTH - for debugging)
router.get("/api/debug/supabase-config", async (req, res) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
    res.json({
      supabaseUrlConfigured: !!supabaseUrl,
      supabaseUrlPreview: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'NOT SET',
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnonKey: !!process.env.VITE_SUPABASE_ANON_KEY,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// Public test endpoint (NO AUTH - for debugging only)
router.get("/api/public/test-leads-noauth", async (req, res) => {
  try {
    console.log("[Public Test] Fetching leads WITHOUT authentication...");
    const leads = await storage.getAllLeads();
    console.log(`[Public Test] Found ${leads.length} leads`);
    res.json({
      success: true,
      totalLeads: leads.length,
      leads: leads,
    });
  } catch (error: any) {
    console.error("[Public Test] Error:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch leads", error: error.message });
  }
});

// TEST ENDPOINTS for new commission system
router.post("/api/test-commission", async (req, res) => {
  try {
    console.log('[Test Commission] Creating test commission directly in Supabase...');
    
    const testCommission = {
      agent_id: 'test-agent-' + Date.now(),
      member_id: 'test-member-' + Date.now(),
      commission_amount: 125.50,
      coverage_type: 'aca',
      status: 'pending',
      payment_status: 'unpaid',
      notes: 'Test commission from API - ' + new Date().toISOString()
    };

    // Insert directly into Supabase using service role
    const { data: newCommission, error: commissionError } = await supabase
      .from('agent_commissions')
      .insert(testCommission)
      .select()
      .single();
    
    if (commissionError) {
      console.error('[Test Commission] ERROR:', commissionError);
      res.status(500).json({ 
        success: false, 
        error: commissionError.message,
        details: commissionError.details
      });
    } else {
      console.log('[Test Commission] ✅ SUCCESS:', newCommission);
      res.json({
        success: true,
        message: 'NEW COMMISSION SYSTEM WORKING!',
        commission: newCommission,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[Test Commission] ERROR:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/api/test-commission-count", async (req, res) => {
  try {
    const { data, error, count } = await supabase
      .from('agent_commissions')
      .select('*', { count: 'exact' });

    if (error) throw new Error(`Query failed: ${error.message}`);
    
    res.json({
      success: true,
      message: `Found ${count} commissions in new table`,
      count: count,
      records: data?.length || 0,
      sampleRecord: data?.[0] || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔍 DEBUG: Test commission calculation endpoint
router.get("/api/test-commission-calc", async (req, res) => {
  try {
    const { calculateCommission } = await import('./commissionCalculator');
    
    const testCases = [
      { plan: 'MyPremierPlan Elite - Member Only', coverage: 'Member Only', rxValet: false },
      { plan: 'MyPremierPlan+ - Member Only', coverage: 'Member Only', rxValet: false },
      { plan: 'MyPremierPlan Base - Member Only', coverage: 'Member Only', rxValet: false },
      // Test with RX Valet add-on (+$2.50 commission)
      { plan: 'MyPremierPlan Elite - Member Only', coverage: 'Member Only', rxValet: true },
      { plan: 'MyPremierPlan+ - Member Only', coverage: 'Member Only', rxValet: true },
      { plan: 'MyPremierPlan Base - Member Only', coverage: 'Member Only', rxValet: true }
    ];
    
    const results = testCases.map(test => {
      const result = calculateCommission(test.plan, test.coverage, test.rxValet);
      return {
        input: test,
        output: result,
        expectedCommission: result?.commission || 0
      };
    });
    
    res.json({
      success: true,
      testCases: results,
      message: 'Commission calculations tested'
    });
  } catch (error: any) {
    console.error('Test commission calc error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to test commission calculations'
    });
  }
});

// Test endpoint for leads system
router.get("/api/test-leads", async (req, res) => {
  try {
    console.log("[Test Leads] Testing leads system...");

    // Test 1: Check if we can query leads table
    const allLeads = await storage.getAllLeads();
    console.log("[Test Leads] Total leads found:", allLeads.length);

    // Test 2: Try to create a test lead
    const testLead = {
      firstName: "System",
      lastName: "Test",
      email: "systemtest@example.com",
      phone: "210-555-TEST",
      message: "System test lead - will be deleted",
      source: "system_test",
      status: "new",
    };

    const createdLead = await storage.createLead(testLead);
    console.log("[Test Leads] Test lead created:", createdLead.id);

    // Clean up test lead
    const { supabase } = await import("./lib/supabaseClient");
    await supabase.from("leads").delete().eq("id", createdLead.id);
    console.log("[Test Leads] Test lead cleaned up");

    res.json({
      success: true,
      totalLeads: allLeads.length,
      recentLeads: allLeads.slice(0, 5).map((lead: any) => ({
        id: lead.id,
        name: `${lead.firstName} ${lead.lastName}`,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        source: lead.source,
        createdAt: lead.createdAt,
      })),
      testResults: {
        canQueryLeads: true,
        canCreateLeads: true,
        databaseConnected: true,
      },
    });
  } catch (error: any) {
    console.error("[Test Leads] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      testResults: {
        canQueryLeads: false,
        canCreateLeads: false,
        databaseConnected: false,
      },
    });
  }
});

// 🔍 DIAGNOSTIC: Check all plans in database with exact names
router.get("/api/debug/plans-diagnostic", async (req, res) => {
  try {
    console.log("[Plans Diagnostic] Fetching ALL plans from database...");
    
    const { data: allPlans, error } = await supabase
      .from('plans')
      .select('*')
      .order('price', { ascending: true });
    
    if (error) {
      console.error("[Plans Diagnostic] Error:", error);
      return res.status(500).json({ error: error.message });
    }
    
    console.log("[Plans Diagnostic] Found", allPlans?.length || 0, "plans");
    
    const diagnostic = {
      totalPlans: allPlans?.length || 0,
      plans: (allPlans || []).map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        exactName: `'${plan.name}'`,
        nameLength: plan.name.length,
        price: plan.price,
        isActive: plan.is_active,
        matchesBase: plan.name === 'MyPremierPlan Base',
        matchesPlus: plan.name === 'MyPremierPlan+',
        matchesElite: plan.name === 'MyPremierPlan Elite',
      })),
      commissionCalculatorExpects: [
        'MyPremierPlan Base',
        'MyPremierPlan+',
        'MyPremierPlan Elite'
      ],
      warnings: []
    };
    
    // Check for mismatches
    (allPlans || []).forEach((plan: { id: number; name: string }) => {
      if (!['MyPremierPlan Base', 'MyPremierPlan+', 'MyPremierPlan Elite'].includes(plan.name)) {
        diagnostic.warnings.push(`Plan "${plan.name}" (ID: ${plan.id}) does NOT match any expected name in commissionCalculator`);
      }
    });
    
    console.log("[Plans Diagnostic] Warnings:", diagnostic.warnings.length);
    console.log("[Plans Diagnostic] Results:", JSON.stringify(diagnostic, null, 2));
    
    res.json(diagnostic);
  } catch (error) {
    console.error("[Plans Diagnostic] Exception:", error);
    res.status(500).json({ error: error.message });
  }
});

// 🔍 DIAGNOSTIC: Test commission calculation with various inputs
router.get("/api/debug/commission-diagnostic", async (req, res) => {
  try {
    console.log("[Commission Diagnostic] Testing commission calculations...");
    
    const testCases = [
      // Test with ACTUAL database plan names (with coverage suffix)
      { plan: 'MyPremierPlan Base - Member Only', coverage: 'Member Only', rxValet: false, note: 'Real DB name' },
      { plan: 'MyPremierPlan Base - Family', coverage: 'Family', rxValet: false, note: 'Real DB name' },
      { plan: 'MyPremierPlan+ - Member Only', coverage: 'Member Only', rxValet: true, note: 'Real DB name + RxValet' },
      { plan: 'MyPremierPlan Elite - Family', coverage: 'Family', rxValet: false, note: 'Real DB name' },
      
      // Test with extracted plan names (what calculator expects)
      { plan: 'MyPremierPlan Base', coverage: 'Member Only', rxValet: false, note: 'Extracted tier' },
      { plan: 'MyPremierPlan Base', coverage: 'Member/Spouse', rxValet: false, note: 'Extracted tier' },
      { plan: 'MyPremierPlan Base', coverage: 'Member/Child', rxValet: false, note: 'Extracted tier' },
      { plan: 'MyPremierPlan Base', coverage: 'Family', rxValet: false, note: 'Extracted tier' },
      { plan: 'MyPremierPlan Base', coverage: 'Family', rxValet: true, note: 'Extracted tier + RxValet' },
      
      // Plus plan tests
      { plan: 'MyPremierPlan+', coverage: 'Member Only', rxValet: false, note: 'Extracted tier' },
      { plan: 'MyPremierPlan+', coverage: 'Family', rxValet: false, note: 'Extracted tier' },
      
      // Elite plan tests
      { plan: 'MyPremierPlan Elite', coverage: 'Member Only', rxValet: false, note: 'Extracted tier' },
      { plan: 'MyPremierPlan Elite', coverage: 'Family', rxValet: true, note: 'Extracted tier + RxValet' },
      
      // Test old incorrect names (should fail)
      { plan: 'Base', coverage: 'Member Only', rxValet: false, note: 'Old broken name' },
      { plan: 'Plus', coverage: 'Family', rxValet: false, note: 'Old broken name' },
      { plan: 'Elite', coverage: 'Family', rxValet: false, note: 'Old broken name' },
    ];
    
    const results = testCases.map(test => {
      // Apply the same extraction logic as registration
      let planNameForCalculation = test.plan;
      if (planNameForCalculation.includes(' - ')) {
        planNameForCalculation = planNameForCalculation.split(' - ')[0].trim();
      }
      
      const result = calculateCommission(planNameForCalculation, test.coverage, test.rxValet);
      const planType = getPlanTypeFromMemberType(test.coverage);
      
      return {
        input: test,
        extractedPlan: planNameForCalculation !== test.plan ? planNameForCalculation : null,
        planType: planType,
        success: result !== null,
        commission: result?.commission || null,
        totalCost: result?.totalCost || null,
        calculatedCorrectly: result !== null,
      };
    });
    
    const diagnostic = {
      timestamp: new Date().toISOString(),
      testCases: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results: results,
      summary: {
        realDatabaseNamesWork: results.slice(0, 4).every(r => r.success),
        extractedNamesWork: results.slice(4, 13).every(r => r.success),
        oldIncorrectNamesFail: results.slice(13).every(r => !r.success),
        readyForProduction: results.slice(0, 13).every(r => r.success) && results.slice(13).every(r => !r.success)
      }
    };
    
    console.log("[Commission Diagnostic] Summary:", diagnostic.summary);
    res.json(diagnostic);
  } catch (error) {
    console.error("[Commission Diagnostic] Exception:", error);
    res.status(500).json({ error: error.message });
  }
});

// 🔍 DIAGNOSTIC: Check recent commissions for labeling issues
router.get("/api/debug/recent-commissions", async (req, res) => {
  try {
    console.log("[Recent Commissions] Fetching last 20 commissions...");
    
    const { data: commissions, error } = await supabase
      .from('agent_commissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (error) {
      console.error("[Recent Commissions] Error:", error);
      return res.status(500).json({ error: error.message });
    }
    
    const diagnostic = {
      totalCommissions: commissions?.length || 0,
      commissions: (commissions || []).map(comm => ({
        id: comm.id,
        createdAt: comm.created_at,
        commissionAmount: comm.commission_amount,
        basePremium: comm.base_premium,
        coverageType: comm.coverage_type,
        status: comm.status,
        paymentStatus: comm.payment_status,
        notes: comm.notes,
        // Parse notes to extract plan info
        notesIncludePlanTier: comm.notes?.includes('(Base)') || comm.notes?.includes('(Plus)') || comm.notes?.includes('(Elite)'),
        notesIncludeCoverageType: comm.notes?.includes('(EE)') || comm.notes?.includes('(ESP)') || comm.notes?.includes('(ECH)') || comm.notes?.includes('(FAM)'),
        hasNewFormat: comm.notes?.includes('Plan:') && comm.notes?.includes('Coverage:'),
      })),
      formatAnalysis: {
        total: commissions?.length || 0,
        withNewFormat: (commissions || []).filter(c => c.notes?.includes('Plan:') && c.notes?.includes('Coverage:')).length,
        withOldFormat: (commissions || []).filter(c => c.notes && !c.notes.includes('Plan:') && !c.notes.includes('Coverage:')).length,
      }
    };
    
    console.log("[Recent Commissions] Format analysis:", diagnostic.formatAnalysis);
    res.json(diagnostic);
  } catch (error) {
    console.error("[Recent Commissions] Exception:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN: Orphaned Supabase Auth User Management
// ============================================

// Find orphaned Supabase Auth users (in Auth but not in database)
router.get('/api/admin/orphaned-auth-users', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    console.log('[Admin] Checking for orphaned Supabase Auth users...');
    
    // Get all Supabase Auth users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      throw new Error(`Auth error: ${authError.message}`);
    }
    
    // Get all database users
    const dbUsers = await storage.getAllUsers();
    const dbUserIds = new Set(dbUsers.map(u => u.id));
    
    // Find auth users not in database
    const orphanedUsers = authData?.users?.filter(authUser => 
      !dbUserIds.has(authUser.id)
    ) || [];
    
    console.log(`[Admin] Found ${orphanedUsers.length} orphaned auth users`);
    
    res.json({
      totalAuthUsers: authData?.users?.length || 0,
      totalDbUsers: dbUsers.length,
      orphanedCount: orphanedUsers.length,
      orphanedUsers: orphanedUsers.map(u => ({
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        emailConfirmed: u.email_confirmed_at ? true : false,
        metadata: u.user_metadata
      }))
    });
  } catch (error: any) {
    console.error('[Admin] Error checking orphaned users:', error);
    res.status(500).json({ 
      message: 'Failed to check orphaned users',
      error: error.message 
    });
  }
});

// Delete orphaned Supabase Auth user
router.delete('/api/admin/orphaned-auth-user/:email', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    if (!user || !isAdmin(user.role)) {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const { email } = req.params;
    console.log(`[Admin] ${user.email} deleting orphaned auth user: ${email}`);
    
    // Find user in Supabase Auth
    const { data: authData } = await supabase.auth.admin.listUsers();
    const authUser = authData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!authUser) {
      return res.status(404).json({ message: 'Auth user not found' });
    }
    
    // Check if user exists in database (should NOT exist for orphaned users)
    const dbUser = await storage.getUserByEmail(email);
    if (dbUser) {
      return res.status(400).json({ 
        message: 'User exists in database - not orphaned. Use regular user deletion.' 
      });
    }
    
    // Delete from Supabase Auth
    const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id);
    if (deleteError) {
      throw new Error(`Failed to delete auth user: ${deleteError.message}`);
    }
    
    console.log(`[Admin] ✅ ${user.email} deleted orphaned auth user: ${email}`);
    
    res.json({
      success: true,
      message: `Orphaned auth user "${email}" deleted successfully`,
      deletedUser: {
        id: authUser.id,
        email: authUser.email
      }
    });
  } catch (error: any) {
    console.error('[Admin] Error deleting orphaned user:', error);
    res.status(500).json({ 
      message: 'Failed to delete orphaned user',
      error: error.message 
    });
  }
});

router.get("/api/plans", async (req, res) => {
  try {
    console.log("[API /plans] Fetching plans...");
    const allPlans = await storage.getPlans();
    console.log("[API /plans] Retrieved plans:", {
      total: allPlans.length,
      active: allPlans.filter((plan) => plan.isActive).length,
      inactive: allPlans.filter((plan) => !plan.isActive).length,
    });

    if (allPlans.length > 0) {
      console.log("[API /plans] Sample plan:", {
        id: allPlans[0].id,
        name: allPlans[0].name,
        isActive: allPlans[0].isActive,
        price: allPlans[0].price,
      });
    }

    const activePlans = allPlans.filter((plan) => plan.isActive);
    console.log("[API /plans] Returning active plans:", activePlans.length);
    res.json(activePlans);
  } catch (error) {
    console.error("[API /plans] Error fetching plans:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch plans", error: error.message });
  }
});

// Auth routes (public - no authentication required)
router.post("/api/auth/login", async (req, res) => {

  try {
    const { email, password } = req.body;
    console.log('[Login] Starting login attempt for:', email);

    // Sign in with Supabase
    console.log('[Login] Calling Supabase auth.signInWithPassword');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[Login] Supabase auth error:', error);
      console.error('[Login] Supabase auth error details:', {
        code: error.code,
        message: error.message,
        status: error.status
      });
      return res
        .status(401)
        .json({ message: error.message || "Invalid credentials" });
    }

    if (!data.session) {
      console.error('[Login] No session returned from Supabase');
      return res.status(401).json({ message: "Failed to create session" });
    }

    console.log('[Login] Supabase auth successful, session created');

    // Get or create user in our database
    console.log("[Login] Checking for existing user:", email);
    let user = await storage.getUserByEmail(email);

    if (!user) {
      console.log("[Login] User not found, creating new user");
      const userRole = determineUserRole(data.user.email!);
      console.log("[Login] Determined role for", email, ":", userRole);

      // Create user in our database if they don't exist
      user = await storage.createUser({
        id: data.user.id,
        email: data.user.email!,
        firstName:
          data.user.user_metadata?.firstName ||
          data.user.user_metadata?.first_name ||
          "User",
        lastName:
          data.user.user_metadata?.lastName ||
          data.user.user_metadata?.last_name ||
          "",
        emailVerified: data.user.email_confirmed_at ? true : false,
        role: userRole,
        isActive: true,
        approvalStatus: "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log("[Login] Created new user:", {
        id: user.id,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
      });
    } else {
      console.log("[Login] Found existing user:", {
        id: user.id,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
      });

      // Update role if it doesn't match the expected role for this email
      const expectedRole = determineUserRole(data.user.email!);
      if (user.role !== expectedRole) {
        console.log(`[Login] Updating user role from ${user.role} to ${expectedRole}`);
        await storage.updateUser(user.id, { role: expectedRole });
        user.role = expectedRole; // Update the local user object
      }
    }

    // Update last login using Supabase service role (bypasses RLS)
    try {
      const { error: lastLoginError } = await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', user.id);
      
      if (lastLoginError) {
        console.warn("[Login] Could not update last login time:", lastLoginError);
      } else {
        console.log("[Login] ✅ Updated last_login_at for user:", user.email);
      }
    } catch (updateError) {
      console.warn("[Login] Exception updating last login:", updateError);
      // Continue with login even if update fails
    }

    // Create login session record
    try {
      const userAgent = req.headers["user-agent"] || "";
      const ipAddress = req.ip || req.connection.remoteAddress || "unknown";

      // Parse user agent for device/browser info
      let deviceType = "desktop";
      let browser = "unknown";

      if (userAgent.includes("Mobile")) deviceType = "mobile";
      else if (userAgent.includes("Tablet")) deviceType = "tablet";

      if (userAgent.includes("Chrome")) browser = "Chrome";
      else if (userAgent.includes("Firefox")) browser = "Firefox";
      else if (userAgent.includes("Safari")) browser = "Safari";
      else if (userAgent.includes("Edge")) browser = "Edge";

      await storage.createLoginSession({
        userId: user.id,
        ipAddress: ipAddress,
        userAgent: userAgent,
        deviceType: deviceType,
        browser: browser,
      });

      console.log("[Login] Session tracked for user:", user.email);
    } catch (subError: any) {
      console.error("[Login] Error tracking session:", subError);
      // Don't fail login if session tracking fails
    }

    console.log("[Login] Login successful for user:", user.email);

    // Return format that matches client expectations
    res.json({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        agentNumber: user.agentNumber,
        profileImageUrl: user.profileImageUrl,
        isActive: user.isActive,
        approvalStatus: user.approvalStatus,
      },
      token: data.session.access_token, // Also include token at root for compatibility
    });
  } catch (error) {
    console.error("❌ [Login] Fatal error:", error);
    console.error("❌ [Login] Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    console.error("❌ [Login] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : typeof error,
    });
    
    res.status(500).json({ 
      message: "Login failed",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

router.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    console.log("[Register] Creating new user:", email);

    // Sign up with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          firstName,
          lastName,
        },
        emailRedirectTo: undefined,
      },
    });

    if (error) {
      console.error("[Register] Supabase signup error:", error);
      return res
        .status(400)
        .json({ success: false, message: error.message || "Registration failed" });
    }

    if (!data.user) {
      console.error("[Register] No user returned from Supabase");
      return res.status(400).json({ success: false, message: "Failed to create user" });
    }

    console.log("[Register] Supabase user created:", data.user.id);

    // Email verification will be required before login
    console.log("[Register] User created - email verification required");

    // Create user in our database with pending approval
    const user = await storage.createUser({
      id: data.user.id,
      email: data.user.email!,
      firstName: firstName || "User",
      lastName: lastName || "",
      emailVerified: false, // Require email verification for security
      role: "agent", // Users who register are agents, not members
      isActive: false, // Not active until admin approves
      approvalStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    console.log("[Registration] User created, pending admin approval:", user.id);

    // ============================================
    // SEND EMAIL VERIFICATION
    // ============================================
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://enrollment.getmydpc.com'}/api/auth/verify-email?token=${data.user.id}&email=${encodeURIComponent(data.user.email!)}`;
    
    try {
      await sendEmailVerification({
        email: data.user.email!,
        firstName: firstName || 'User',
        verificationUrl
      });
      console.log(`[Registration] Verification email sent to ${data.user.email}`);
    } catch (emailError) {
      console.error(`[Registration] Failed to send verification email:`, emailError);
      // Continue anyway - user can request resend
    }

    res.json({
      success: true,
      message:
        "Registration successful! Your account is pending admin approval. You'll be notified once approved.",
      session: data.session
        ? {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
          }
        : null,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        approvalStatus: user.approvalStatus,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
});

router.post("/api/auth/logout", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Logout error:", error);
      }
    }

    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Logout failed" });
  }
});

// Mark password change as completed (remove requirement flag)
router.post("/api/auth/password-change-completed", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Update the user record to remove password change requirement
    const { data, error } = await supabase
      .from("users")
      .update({
        passwordChangeRequired: false,
        lastPasswordChangeAt: new Date().toISOString()
      })
      .eq("id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[Password Change] Failed to update user:", error);
      return res.status(500).json({ 
        message: "Failed to update password change status",
        error: error.message 
      });
    }

    console.log(`[Password Change] User ${user.email} completed password change`);
    res.json({ 
      message: "Password change completed successfully",
      user: data
    });
  } catch (error) {
    console.error("[Password Change] Error:", error);
    res.status(500).json({ 
      message: "Failed to complete password change",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Email verification endpoint - verify user's email via token
router.get("/api/auth/verify-email", async (req, res) => {
  try {
    const { token, email } = req.query;

    if (!token || !email) {
      return res.status(400).json({ 
        message: "Missing verification token or email" 
      });
    }

    console.log(`[Email Verification] Verifying email for: ${email}`);

    // Get user from database
    const user = await storage.getUserByEmail(email as string);

    if (!user) {
      return res.status(404).json({ 
        message: "User not found" 
      });
    }

    // Verify token matches user ID
    if (user.id !== token) {
      return res.status(400).json({ 
        message: "Invalid verification token" 
      });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.redirect(`${process.env.FRONTEND_URL || 'https://enrollment.getmydpc.com'}/login?verified=already`);
    }

    // Update user to mark email as verified
    const { error } = await supabase
      .from("users")
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("[Email Verification] Failed to update user:", error);
      return res.status(500).json({ 
        message: "Failed to verify email",
        error: error.message 
      });
    }

    // Also confirm email in Supabase Auth
    try {
      await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true
      });
    } catch (authError) {
      console.warn("[Email Verification] Failed to confirm in Supabase Auth:", authError);
      // Continue anyway - database is source of truth
    }

    console.log(`[Email Verification] Email verified successfully for: ${email}`);

    // Generate password setup link and send credentials email
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: user.email,
        options: {
          redirectTo: `${process.env.FRONTEND_URL || 'https://enrollment.getmydpc.com'}/reset-password?source=welcome`
        }
      });

      if (linkError) {
        console.error('[Email Verification] Failed to generate password setup link:', linkError);
      } else if (linkData?.action_link) {
        await sendUserCredentialsEmail({
          email: user.email,
          firstName: user.firstName,
          loginUrl: `${process.env.FRONTEND_URL || 'https://enrollment.getmydpc.com'}/login`,
          setPasswordUrl: linkData.action_link
        });
      }
    } catch (linkErr) {
      console.error('[Email Verification] Error while sending credential email:', linkErr);
    }
    
    // Redirect to login page with success message
    res.redirect(`${process.env.FRONTEND_URL || 'https://enrollment.getmydpc.com'}/login?verified=success`);
  } catch (error) {
    console.error("[Email Verification] Error:", error);
    res.status(500).json({ 
      message: "Email verification failed",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Resend email verification
router.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        message: "Email is required" 
      });
    }

    console.log(`[Resend Verification] Resending verification email to: ${email}`);

    // Get user from database
    const user = await storage.getUserByEmail(email);

    if (!user) {
      // Don't reveal whether user exists or not for security
      return res.json({ 
        message: "If an account exists with this email, a verification link has been sent." 
      });
    }

    // Check if already verified
    if (user.emailVerified) {
      return res.json({ 
        message: "Email is already verified. You can log in now." 
      });
    }

    // Generate verification URL
    const verificationUrl = `${process.env.FRONTEND_URL || 'https://enrollment.getmydpc.com'}/api/auth/verify-email?token=${user.id}&email=${encodeURIComponent(email)}`;
    
    // Send verification email
    await sendEmailVerification({
      email,
      firstName: user.firstName,
      verificationUrl
    });

    console.log(`[Resend Verification] Verification email resent to: ${email}`);
    
    res.json({ 
      message: "Verification email sent. Please check your inbox." 
    });
  } catch (error) {
    console.error("[Resend Verification] Error:", error);
    res.status(500).json({ 
      message: "Failed to send verification email",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
});

// Helper function to determine user role
function determineUserRole(email: string): "super_admin" | "admin" | "agent" {
  // Super Admin - full platform access
  if (email === "michael@mypremierplans.com") {
    return "super_admin";
  }

  // Admins - user management and data viewing
  const adminEmails = [
    "travis@mypremierplans.com",
    "joaquin@mypremierplans.com",
  ];

  const agentEmails = [
    "richard@cyariskmanagement.com",
    "mdkeener@gmail.com",
    "mkeener@lonestarenotary.com", // Mike Keener - LoneStar Notary
    "bdkelp@gmail.com", // Duanne Keener
    "tmatheny77@gmail.com",
    "svillarreal@cyariskmanagement.com",
  ];

  if (adminEmails.includes(email)) return "admin";
  if (agentEmails.includes(email)) return "agent";
  // NOTE: Users table defaults to 'agent' for unknown emails; members live in members table
  return "agent";
}

// Authentication route (protected)
router.get(
  "/api/auth/user",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Get user's subscription and plan info
      const userSubscriptions = await storage.getUserSubscriptions(req.user.id);
      const activeSubscription = userSubscriptions.find(
        (sub) => sub.status === "active",
      );

      let planInfo = null;
      if (activeSubscription && activeSubscription.planId) {
        try {
          const plan = await storage.getPlan(activeSubscription.planId);
          planInfo = plan;
        } catch (error) {
          console.error("Error fetching plan:", error);
          // Continue without plan info
        }
      }

      const userResponse = {
        id: req.user.id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        role: req.user.role,
        agentNumber: req.user.agentNumber, // Include agent number for agents and admins
        profileImageUrl: req.user.profileImageUrl, // Include profile image for dashboard display
        lastLoginAt: req.user.lastLoginAt, // Include last login timestamp
        subscription: activeSubscription,
        plan: planInfo,
        isActive: req.user.isActive,
        approvalStatus: req.user.approvalStatus,
      };

      res.json(userResponse);
    } catch (error) {
      console.error("Error in /api/auth/user:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// GET user profile endpoint
router.get(
  "/api/user/profile",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "User not found" });
      }

      console.log('[Profile GET] Fetching profile for user:', req.user.email);
      
      // Get the full user profile including banking information
      const userProfile = await storage.getUser(req.user.id, {
        fallbackEmail: req.user.email,
      });
      
      if (!userProfile) {
        return res.status(404).json({ message: "Profile not found" });
      }

      console.log('[Profile GET] Profile data retrieved:', userProfile ? 'found' : 'null');
      
      res.json(userProfile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  },
);

router.put(
  "/api/user/profile",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      console.log('[Profile Update] Starting profile update for user:', req.user?.email);
      console.log('[Profile Update] Request body:', JSON.stringify(req.body, null, 2));
      
      const updateData = req.body;
      delete updateData.id; // Prevent ID modification
      delete updateData.role; // Prevent role modification via profile update
      delete updateData.createdAt; // Prevent creation date modification
      delete updateData.approvalStatus; // Prevent approval status modification
      delete updateData.agentNumber; // Prevent agent number modification via profile update

      console.log('[Profile Update] Cleaned update data:', JSON.stringify(updateData, null, 2));

      // Validate phone number format if provided
      if (updateData.phone) {
        const phoneRegex =
          /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
        if (!phoneRegex.test(updateData.phone)) {
          return res
            .status(400)
            .json({ message: "Invalid phone number format" });
        }
      }

      // Validate email format if changed
      if (updateData.email && updateData.email !== req.user!.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(updateData.email)) {
          return res.status(400).json({ message: "Invalid email format" });
        }

        // Check if email is already in use by another user
        const existingUser = await storage.getUserByEmail(updateData.email);
        if (existingUser && existingUser.id !== req.user!.id) {
          return res.status(400).json({ message: "Email already in use" });
        }
      }

      console.log('[Profile Update] Calling storage.updateUser with user ID:', req.user!.id);
      const updatedUser = await storage.updateUser(
        req.user!.id,
        {
          ...updateData,
          updatedAt: new Date(),
        },
        {
          fallbackEmail: req.user!.email,
        },
      );

      console.log('[Profile Update] Update successful, returning user:', updatedUser ? 'found' : 'null');
      console.log('[Profile Update] Updated user data:', JSON.stringify(updatedUser, null, 2));
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  },
);

// User activity tracking endpoint for SessionManager
router.post(
  "/api/user/activity",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 USER ACTIVITY ROUTE HIT - User:", req.user?.email);
    try {
      res.json({ success: true, timestamp: new Date() });
    } catch (error) {
      console.error("❌ Error updating user activity:", error);
      res.status(500).json({ message: "Failed to update activity" });
    }
  },
);

// Additional user activity endpoint (using router)
router.post("/api/user/activity-ping", async (req: any, res: any) => {
  console.log("🔍 USER ACTIVITY PING ROUTE HIT");

  // Add CORS headers
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://getmydpc-enrollment-gjk6m.ondigitalocean.app',
    'https://enrollment.getmydpc.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000'
  ];

  if (allowedOrigins.includes(origin as string)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }

  try {
    res.json({ success: true, timestamp: new Date(), activity: "ping" });
  } catch (error) {
    console.error("❌ Error in user activity ping:", error);
    res.status(500).json({ message: "Failed to update activity" });
  }
});

// Subscription routes
router.get(
  "/api/user/subscription",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      const subscriptions = await storage.getUserSubscriptions(req.user!.id);
      res.json(subscriptions);
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  },
);

// User login sessions endpoint
router.get(
  "/api/user/login-sessions",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 USER LOGIN SESSIONS ROUTE HIT - User:", req.user?.email);
    try {
      const { limit = "10" } = req.query;
      console.log("✅ Calling getUserLoginSessions for user:", req.user!.id);
      
      const loginSessions = await storage.getUserLoginSessions(req.user!.id, parseInt(limit as string));
      console.log("✅ Got", loginSessions?.length || 0, "login sessions for user");
      
      res.json(loginSessions);
    } catch (error: any) {
      console.error("❌ Error fetching user login sessions:", error);
      res.status(500).json({ message: "Failed to fetch login sessions" });
    }
  },
);

// User enrollments endpoint for agents to see their enrollment activity
router.get(
  "/api/user/enrollments",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 USER ENROLLMENTS ROUTE HIT - User:", req.user?.email, "Role:", req.user?.role);
    
    // Only agents (and super admins acting as agents) can access their enrollments
    if (!isAgentRole(req.user!.role)) {
      return res.status(403).json({ 
        message: "Access denied. Only agents can view their enrollment activity." 
      });
    }
    
    try {
      const { startDate, endDate, limit = "20" } = req.query;
      console.log("✅ Calling getEnrollmentsByAgent for agent:", req.user!.id);
      
      const enrollments = await storage.getEnrollmentsByAgent(
        req.user!.id, 
        startDate as string, 
        endDate as string
      );
      
      // Limit the results if specified
      const limitedEnrollments = enrollments.slice(0, parseInt(limit as string));
      
      console.log("✅ Got", limitedEnrollments?.length || 0, "enrollments for agent");
      
      res.json(limitedEnrollments);
    } catch (error) {
      console.error("❌ Error fetching user enrollments:", error);
      res.status(500).json({ message: "Failed to fetch enrollments" });
    }
  },
);

// Lead management routes
router.get("/api/leads", authenticateToken, async (req: AuthRequest, res) => {
  try {
    let leads;

    if (isAdmin(req.user!.role)) {
      leads = await storage.getAllLeads();
    } else if (req.user!.role === "agent") {
      leads = await storage.getAgentLeads(req.user!.id);
    } else {
      return res.status(403).json({ message: "Not authorized to view leads" });
    }

    res.json(leads);
  } catch (error) {
    console.error("Error fetching leads:", error);
    res.status(500).json({ message: "Failed to fetch leads" });
  }
});

router.post("/api/leads", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { firstName, lastName, email, phone, message, source } = req.body;

    const lead = await storage.createLead({
      firstName,
      lastName,
      email,
      phone,
      message: message || "",
      source: source || "contact_form",
      status: "new",
      assignedAgentId: (req.user!.role === "agent") ? req.user!.id : null,
    });

    res.status(201).json(lead);
  } catch (error) {
    console.error("Error creating lead:", error);
    res.status(500).json({ message: "Failed to create lead" });
  }
});

// Update lead (status, notes, assignment, etc.)
router.put("/api/leads/:leadId", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const leadId = parseInt(req.params.leadId);
    const updates = req.body;

    console.log(`[Leads API] Updating lead ${leadId} with:`, updates);

    const updatedLead = await storage.updateLead(leadId, updates);
    
    res.json(updatedLead);
  } catch (error: any) {
    console.error("[Leads API] Error updating lead:", error);
    res.status(500).json({
      message: "Failed to update lead",
      error: error.message,
    });
  }
});

// Add activity to lead
router.post("/api/leads/:leadId/activities", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const leadId = parseInt(req.params.leadId);
    const { activityType, notes } = req.body;

    console.log(`[Leads API] Adding activity to lead ${leadId}:`, { activityType, notes });

    const activity = await storage.addLeadActivity({
      leadId,
      agentId: req.user!.id,
      activityType,
      notes,
      createdAt: new Date()
    });

    res.json(activity);
  } catch (error: any) {
    console.error("[Leads API] Error adding activity:", error);
    res.status(500).json({
      message: "Failed to add activity",
      error: error.message,
    });
  }
});

// Payment processing endpoint with error handling
router.post(
  "/api/process-payment",
  authenticateToken,
  async (req: AuthRequest, res) => {
    try {
      console.log("[Payment Processing] Request received:", {
        userId: req.user!.id,
        bodyKeys: Object.keys(req.body),
        amount: req.body.amount,
      });

      const { planId, amount, paymentMethod } = req.body;

      if (!planId || !amount) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: planId and amount",
        });
      }

      // Validate plan exists
      if (!planId) {
        return res.status(400).json({ message: "Plan ID is required" });
      }
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({
          success: false,
          error: "Plan not found",
        });
      }

      // For now, redirect to EPX payment creation
      res.json({
        success: true,
        message: "Use EPX payment endpoint",
        redirectTo: "/api/epx/create-payment",
      });
    } catch (error: any) {
      console.error("[Payment Processing] Error:", error);
      res.status(500).json({
        success: false,
        error: "Payment processing failed",
        details: error.message,
      });
    }
  },
);

// Public lead submission endpoint (for contact forms)
router.post("/api/public/leads", async (req: any, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Public Leads] === ENDPOINT HIT ===`);
  console.log(`[${timestamp}] [Public Leads] Method:`, req.method);
  console.log(`[${timestamp}] [Public Leads] Origin:`, req.headers.origin);
  console.log(`[${timestamp}] [Public Leads] Headers:`, JSON.stringify(req.headers, null, 2));

  // Set CORS headers FIRST before any other processing
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://getmydpc-enrollment-gjk6m.ondigitalocean.app',
    'https://enrollment.getmydpc.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000'
  ];

  const regexPatterns = [/\.ondigitalocean\.app$/];
  const isAllowedByRegex = origin && regexPatterns.some(pattern => pattern.test(origin));

  // Always set CORS headers for this public endpoint
  if (allowedOrigins.includes(origin as string) || isAllowedByRegex) {
    res.header('Access-Control-Allow-Origin', origin);
    console.log(`[${timestamp}] [Public Leads] CORS allowed for origin: ${origin}`);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
    console.log(`[${timestamp}] [Public Leads] CORS wildcard for origin: ${origin}`);
  }

  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,Cache-Control,X-File-Name');

  console.log(`[${timestamp}] [Public Leads] Body type:`, typeof req.body);
  console.log(`[${timestamp}] [Public Leads] Raw body:`, JSON.stringify(req.body, null, 2));

  try {
    // Check if body exists and is parsed
    if (!req.body) {
      console.error(`[${timestamp}] [Public Leads] No request body found`);
      return res.status(400).json({
        error: "No data received",
        debug: "Request body is empty",
        timestamp,
      });
    }

    const { firstName, lastName, email, phone, message } = req.body;

    console.log(`[${timestamp}] [Public Leads] Extracted fields:`, {
      firstName: !!firstName,
      lastName: !!lastName,
      email: !!email,
      phone: !!phone,
      message: !!message,
    });

    // Check required fields
    const missingFields = [];
    if (!firstName) missingFields.push("firstName");
    if (!lastName) missingFields.push("lastName");
    if (!email) missingFields.push("email");
    if (!phone) missingFields.push("phone");

    if (missingFields.length > 0) {
      console.log(
        `[${timestamp}] [Public Leads] Missing required fields:`,
        missingFields,
      );
      return res.status(400).json({
        error: "Missing required fields",
        missingFields,
        receivedData: { firstName, lastName, email, phone },
        timestamp,
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`[${timestamp}] [Public Leads] Invalid email format:`, email);
      return res.status(400).json({ error: "Invalid email format", timestamp });
    }

    // Validate phone (basic check)
    if (phone.length < 10) {
      console.log(`[${timestamp}] [Public Leads] Invalid phone format:`, phone);
      return res
        .status(400)
        .json({ error: "Invalid phone number format", timestamp });
    }

    console.log(
      `[${timestamp}] [Public Leads] Validation passed, creating lead...`,
    );

    const leadData = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      message: message ? message.trim() : "",
      source: "contact_form",
      status: "new",
    };

    console.log(
      `[${timestamp}] [Public Leads] Lead data to create:`,
      JSON.stringify(leadData, null, 2),
    );

    let lead;
    try {
      // CREATE LEAD DIRECTLY IN SUPABASE (NO AUTH REQUIRED - PUBLIC ENDPOINT)
      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert({
          first_name: leadData.firstName,
          last_name: leadData.lastName,
          email: leadData.email,
          phone: leadData.phone,
          message: leadData.message,
          source: leadData.source,
          status: leadData.status
        })
        .select()
        .single();

      if (leadError) {
        console.error(`[${timestamp}] [Public Leads] Supabase error:`, leadError);
        throw new Error(`Failed to create lead: ${leadError.message}`);
      }

      lead = {
        id: newLead.id,
        email: newLead.email,
        status: newLead.status,
        source: newLead.source
      };

      console.log(`[${timestamp}] [Public Leads] Lead created successfully in Supabase:`, {
        id: lead.id,
        email: lead.email,
        status: lead.status,
        source: lead.source,
      });

      // Send email notification (don't fail if email fails)
      try {
        await sendLeadSubmissionEmails({
          firstName: leadData.firstName,
          lastName: leadData.lastName,
          email: leadData.email,
          phone: leadData.phone,
          message: leadData.message,
          source: leadData.source,
        });
        console.log(`[${timestamp}] [Public Leads] Email notification sent successfully`);
      } catch (emailError: any) {
        console.error(`[${timestamp}] [Public Leads] Email notification failed:`, emailError.message);
        // Don't throw - we still want to return success even if email fails
      }
    } catch (storageError: any) {
      console.error(
        `[${timestamp}] [Public Leads] Storage error creating lead:`,
        {
          error: storageError.message,
          code: storageError.code,
          details: storageError.details,
          hint: storageError.hint,
          leadData: leadData,
        },
      );

      // Try to provide more specific error messages
      if (
        storageError.message?.includes("column") &&
        storageError.message?.includes("does not exist")
      ) {
        throw new Error(`Database schema mismatch: ${storageError.message}`);
      } else if (
        storageError.message?.includes("permission denied") ||
        storageError.message?.includes("RLS")
      ) {
        throw new Error("Permission denied: Lead submission not allowed");
      } else {
        throw storageError;
      }
    }

    res.json({
      success: true,
      leadId: lead.id,
      message: "Lead submitted successfully",
      timestamp,
    });
  } catch (error: any) {
    console.error(`[${timestamp}] [Public Leads] Error creating lead:`, {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });

    res.status(500).json({
      error: "Failed to submit lead",
      details: error.message,
      timestamp,
      errorCode: error.code,
    });
  }
});

router.post("/api/public/partner-leads", async (req: any, res) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Partner Leads] === ENDPOINT HIT ===`);

  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://getmydpc-enrollment-gjk6m.ondigitalocean.app',
    'https://enrollment.getmydpc.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000'
  ];
  const regexPatterns = [/\.ondigitalocean\.app$/];
  const isAllowedByRegex = origin && regexPatterns.some(pattern => pattern.test(origin));

  if (allowedOrigins.includes(origin as string) || isAllowedByRegex) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,HEAD');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With,Accept,Origin,Cache-Control,X-File-Name');

  try {
    if (!req.body) {
      return res.status(400).json({ error: 'No data received', timestamp });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      agencyName,
      agencyWebsite,
      statesServed,
      experienceLevel,
      volumeEstimate,
      message
    } = req.body;

    const missingFields = [] as string[];
    if (!firstName) missingFields.push('firstName');
    if (!lastName) missingFields.push('lastName');
    if (!email) missingFields.push('email');
    if (!phone) missingFields.push('phone');
    if (!agencyName) missingFields.push('agencyName');
    if (!statesServed) missingFields.push('statesServed');

    if (missingFields.length) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields,
        timestamp
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format', timestamp });
    }

    if (typeof phone !== 'string' || phone.replace(/[^0-9]/g, '').length < 10) {
      return res.status(400).json({ error: 'Invalid phone number format', timestamp });
    }

    const normalized = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      agencyName: agencyName.trim(),
      agencyWebsite: agencyWebsite?.trim(),
      statesServed: statesServed.trim(),
      experienceLevel: experienceLevel?.trim(),
      volumeEstimate: volumeEstimate?.trim(),
      message: (message || '').trim()
    };

    const metadata = {
      agencyName: normalized.agencyName,
      agencyWebsite: normalized.agencyWebsite,
      statesServed: normalized.statesServed,
      experienceLevel: normalized.experienceLevel,
      volumeEstimate: normalized.volumeEstimate
    };

    const notesPayload = {
      metadata,
      adminNotes: [] as any[],
    };

    const { data: newLead, error: leadError } = await supabase
      .from('leads')
      .insert({
        first_name: normalized.firstName,
        last_name: normalized.lastName,
        email: normalized.email,
        phone: normalized.phone,
        message: normalized.message,
        source: 'partner_lead',
        status: 'new',
        notes: JSON.stringify(notesPayload)
      })
      .select()
      .single();

    if (leadError) {
      throw new Error(`Failed to create partner lead: ${leadError.message}`);
    }

    try {
      await sendPartnerInquiryEmails({
        firstName: normalized.firstName,
        lastName: normalized.lastName,
        email: normalized.email,
        phone: normalized.phone,
        agencyName: normalized.agencyName,
        agencyWebsite: normalized.agencyWebsite,
        statesServed: normalized.statesServed,
        experienceLevel: normalized.experienceLevel,
        volumeEstimate: normalized.volumeEstimate,
        message: normalized.message
      });
    } catch (emailError) {
      console.error(`[${timestamp}] [Partner Leads] Email notification failed:`, emailError);
    }

    res.json({
      success: true,
      leadId: newLead?.id,
      message: 'Partner inquiry submitted successfully',
      timestamp
    });
  } catch (error: any) {
    console.error(`[${timestamp}] [Partner Leads] Error:`, error);
    res.status(500).json({
      error: 'Failed to submit partner inquiry',
      details: error.message,
      timestamp
    });
  }
});

// Admin routes
router.get(
  "/api/admin/stats",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      console.log(
        "[Admin Stats API] Access denied - user role:",
        req.user!.role,
      );
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      console.log(
        "[Admin Stats API] Fetching stats for admin:",
        req.user!.email,
      );
      const stats = await storage.getAdminDashboardStats();
      console.log("[Admin Stats API] Retrieved stats:", stats);
      res.json(stats);
    } catch (error: any) {
      console.error("[Admin Stats API] Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch admin stats" });
    }
  },
);

router.get(
  "/api/admin/users",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      console.log(
        "[Admin Users API] Access denied - user role:",
        req.user!.role,
      );
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Add CORS headers for external browser access
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Origin", req.headers.origin || "*");

      console.log(
        "[Admin Users API] Fetching users for admin:",
        req.user!.email,
      );
      const filterType = req.query.filter as string;

      // IMPORTANT: Users table = Staff (admins/agents) ONLY
      // Members table = DPC enrollees (customers) - separate table
      // If filter is 'members', fetch from members table (DPC customers)
      // Otherwise fetch from users table (staff: admins/agents)
      const usersResult =
        filterType === "members"
          ? await storage.getMembersOnly()
          : await storage.getAllUsers();

      if (!usersResult || !usersResult.users) {
        console.error("[Admin Users API] No users data returned from storage");
        return res
          .status(500)
          .json({ message: "Failed to fetch users - no data returned" });
      }

      const users = usersResult.users;
      console.log("[Admin Users API] Retrieved users count:", users.length);
      // Enhance users with subscription data - simplified approach
      const enhancedUsers = [];
      for (const user of users) {
        try {
          let enhancedUser = { ...user };

          // VALIDATION: Users table should ONLY contain 'admin', 'super_admin', and 'agent' roles
          // Members (DPC customers) are in a separate 'members' table with NO login access
          if (!hasAgentOrAdminAccess(user.role)) {
            console.warn(`[Admin Users API] INVALID ROLE in users table: ${user.role} for ${user.email} - should be admin/super_admin/agent only`);
          }

          enhancedUsers.push(enhancedUser);
        } catch (userError) {
          console.error(
            `[Admin Users API] Error processing user ${user.id}:`,
            userError,
          );
          // Add user without enhancements rather than failing completely
          enhancedUsers.push(user);
        }
      }

      console.log(
        "[Admin Users API] Successfully enhanced users count:",
        enhancedUsers.length,
      );

      res.json({
        users: enhancedUsers,
        totalCount: enhancedUsers.length,
      });
    } catch (error) {
      console.error("[Admin Users API] Error fetching users:", error);
      console.error("[Admin Users API] Error stack:", error.stack);
      res.status(500).json({
        message: "Failed to fetch users",
        error: error.message,
        details: "Check server logs for more information",
      });
    }
  },
);

router.get(
  "/api/admin/partner-leads",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const leads = await storage.getPartnerLeads(status);
      res.json({
        leads,
        total: leads.length,
        filter: status || 'all',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error('[Admin Partner Leads] Failed to fetch leads:', error);
      res.status(500).json({ message: 'Failed to fetch partner leads', error: error.message });
    }
  }
);

router.put(
  "/api/admin/partner-leads/:leadId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const leadId = Number(req.params.leadId);
    if (!Number.isFinite(leadId)) {
      return res.status(400).json({ message: 'Invalid lead ID' });
    }

    const { status, adminNote, assignedAgentId } = req.body || {};
    if (
      !status &&
      !adminNote &&
      typeof assignedAgentId === 'undefined'
    ) {
      return res.status(400).json({ message: 'No updates provided' });
    }

    try {
      const updatedLead = await storage.updatePartnerLeadStatus(leadId, {
        status,
        adminNote,
        assignedAgentId: assignedAgentId ?? undefined,
        updatedBy: req.user?.id,
      });

      res.json({
        success: true,
        lead: updatedLead,
      });
    } catch (error: any) {
      console.error('[Admin Partner Leads] Failed to update lead:', error);
      res.status(500).json({ message: 'Failed to update partner lead', error: error.message });
    }
  }
);

// Admin endpoint to view all user banking information
router.get(
  "/api/admin/user-banking",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 ADMIN USER BANKING ROUTE HIT - Admin:", req.user?.email);
    
    if (!isAdmin(req.user!.role)) {
      console.log("[Admin Banking API] Access denied - user role:", req.user!.role);
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Add CORS headers for external browser access
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Origin", req.headers.origin || "*");

      console.log("[Admin Banking API] Fetching banking info for admin:", req.user!.email);
      
      // Get all users with banking information
      const usersResult = await storage.getAllUsers();
      
      if (!usersResult || !usersResult.users) {
        console.error("[Admin Banking API] No users data returned from storage");
        return res.status(500).json({ message: "Failed to fetch users" });
      }

      // Filter users who have banking information and format the data
      const usersWithBanking = usersResult.users
        .filter((user: any) => 
          user.bankName || user.routingNumber || user.accountNumber || 
          user.accountType || user.accountHolderName
        )
        .map((user: any) => ({
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          agentNumber: user.agentNumber,
          role: user.role,
          isActive: user.isActive,
          // Banking information
          bankName: user.bankName,
          routingNumber: user.routingNumber,
          accountType: user.accountType,
          accountHolderName: user.accountHolderName,
          // Mask account number for security (show only last 4 digits)
          accountNumber: user.accountNumber ? 
            `****${user.accountNumber.slice(-4)}` : null,
          updatedAt: user.updatedAt
        }));

      console.log("[Admin Banking API] Users with banking info count:", usersWithBanking.length);

      res.json({
        users: usersWithBanking,
        totalCount: usersWithBanking.length,
        message: usersWithBanking.length === 0 ? "No users have banking information on file" : undefined
      });
    } catch (error) {
      console.error("[Admin Banking API] Error fetching banking info:", error);
      res.status(500).json({ 
        message: "Failed to fetch banking information", 
        error: error.message 
      });
    }
  },
);

// Admin endpoint to view banking change history across all users
router.get(
  "/api/admin/banking-changes",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 ADMIN BANKING CHANGES ROUTE HIT - Admin:", req.user?.email);
    
    if (!isAdmin(req.user!.role)) {
      console.log("[Admin Banking Changes API] Access denied - user role:", req.user!.role);
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      // Add CORS headers for external browser access
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Allow-Origin", req.headers.origin || "*");

      const { userId, limit = "50" } = req.query;
      console.log("[Admin Banking Changes API] Fetching banking changes, userId:", userId, "limit:", limit);

      let changeHistory = [];

      if (userId) {
        // Get changes for specific user
        changeHistory = await storage.getBankingChangeHistory(userId as string);
      } else {
        // Get all banking changes across all users (admin overview)
        // This would require a new storage function, for now let's get recent changes
        const result = await storage.query(
          `SELECT 
            em.id, 
            em.user_id, 
            em.modified_by, 
            em.change_details, 
            em.created_at,
            u.email,
            u.first_name,
            u.last_name,
            u.agent_number
           FROM enrollment_modifications em
           LEFT JOIN users u ON u.id = em.user_id
           WHERE em.change_type = 'banking_info_update' 
           ORDER BY em.created_at DESC
           LIMIT $1`,
          [parseInt(limit as string)]
        );
        
        changeHistory = result.rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          modifiedBy: row.modified_by,
          changeDetails: row.change_details,
          createdAt: row.created_at,
          userInfo: {
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            agentNumber: row.agent_number
          }
        }));
      }

      console.log("[Admin Banking Changes API] Retrieved changes count:", changeHistory.length);

      res.json({
        changes: changeHistory,
        totalCount: changeHistory.length,
        userId: userId || null,
        message: changeHistory.length === 0 ? "No banking information changes found" : undefined
      });
    } catch (error) {
      console.error("[Admin Banking Changes API] Error fetching banking changes:", error);
      res.status(500).json({ 
        message: "Failed to fetch banking change history", 
        error: error.message 
      });
    }
  },
);

router.get(
  "/api/admin/pending-users",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const users = await storage.getAllUsers();
      const pendingUsers =
        users.users?.filter((user: any) => user.approvalStatus === "pending") ||
        [];
      res.json(pendingUsers);
    } catch (error) {
      console.error("Error fetching pending users:", error);
      res.status(500).json({ message: "Failed to fetch pending users" });
    }
  },
);

router.post(
  "/api/admin/approve-user/:userId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const updatedUser = await storage.updateUser(userId, {
        approvalStatus: "approved",
        updatedAt: new Date(),
      });
      res.json(updatedUser);
    } catch (error) {
      console.error("Error approving user:", error);
      res.status(500).json({ message: "Failed to approve user" });
    }
  },
);

// Get all DPC members from Neon database
router.get(
  "/api/admin/dpc-members",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      console.log("[Admin DPC Members API] Fetching DPC members from Neon database");
      const members = await storage.getAllDPCMembers();
      console.log(`[Admin DPC Members API] Retrieved ${members.length} members`);
      res.json({
        members: members,
        totalCount: members.length,
      });
    } catch (error: any) {
      console.error("[Admin DPC Members API] Error fetching DPC members:", error);
      res.status(500).json({
        message: "Failed to fetch DPC members",
        error: error.message,
      });
    }
  },
);

// Suspend DPC member
router.put(
  "/api/admin/dpc-members/:customerId/suspend",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { customerId } = req.params;
      const { reason } = req.body;
      
      console.log(`[Admin] Suspending DPC member: ${customerId}`);
      const updatedMember = await storage.suspendDPCMember(customerId, reason);
      
      res.json({
        success: true,
        message: "Member suspended successfully",
        member: updatedMember
      });
    } catch (error: any) {
      console.error("[Admin] Error suspending DPC member:", error);
      res.status(500).json({
        message: "Failed to suspend member",
        error: error.message
      });
    }
  },
);

// Reactivate DPC member
router.put(
  "/api/admin/dpc-members/:customerId/reactivate",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { customerId } = req.params;
      
      console.log(`[Admin] Reactivating DPC member: ${customerId}`);
      const updatedMember = await storage.reactivateDPCMember(customerId);
      
      res.json({
        success: true,
        message: "Member reactivated successfully",
        member: updatedMember
      });
    } catch (error: any) {
      console.error("[Admin] Error reactivating DPC member:", error);
      res.status(500).json({
        message: "Failed to reactivate member",
        error: error.message
      });
    }
  },
);

router.post(
  "/api/admin/reject-user/:userId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const updatedUser = await storage.updateUser(userId, {
        approvalStatus: "rejected",
        rejectionReason: reason,
        updatedAt: new Date(),
      });
      res.json(updatedUser);
    } catch (error) {
      console.error("Error rejecting user:", error);
      res.status(500).json({ message: "Failed to reject user" });
    }
  },
);

// Admin user management endpoints
router.put(
  "/api/admin/users/:userId/role",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { role } = req.body;

      // Users table should ONLY contain 'admin' and 'agent' roles
      // 'member' is NOT a user role - members are enrolled customers in separate members table
      if (!["agent", "admin"].includes(role)) {
        return res
          .status(400)
          .json({
            message:
              "Invalid role. Must be 'agent' (enrollment agent) or 'admin' (system administrator). Note: 'member' is not a valid user role - members are enrolled customers in the members table.",
          });
      }

      const updatedUser = await storage.updateUser(userId, {
        role,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  },
);

router.put(
  "/api/admin/users/:userId/agent-number",
  authenticateToken,
  async (req: AuthRequest, res) => {
    // CRITICAL: Only admins can assign/modify agent numbers for commission tracking
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { agentNumber } = req.body;

      // Get user to validate they can have an agent number
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Only agents, admins, or super admins should have agent numbers (they enroll DPC members)
      if (!hasAgentOrAdminAccess(user.role)) {
        return res.status(400).json({
          success: false,
          error: "Only agents and admins can be assigned agent numbers",
        });
      }

      // Validate agent number format if provided
      if (agentNumber && agentNumber.trim() !== "") {
        const trimmedAgentNumber = agentNumber.trim().toUpperCase();

        // Validate MPP format: MPP + 2-letter role code + 2-digit year + 4-digit SSN
        const agentNumberPattern = /^MPP[SA|AG][0-9]{2}[0-9]{4}$/;
        if (!agentNumberPattern.test(trimmedAgentNumber)) {
          return res.status(400).json({
            success: false,
            error:
              "Agent number must follow format: MPP[SA|AG][YY][SSSS] (e.g., MPPSA231154 for Super Admin or MPPAG231154 for Agent)",
          });
        }

        if (trimmedAgentNumber.length !== 12) {
          return res.status(400).json({
            success: false,
            error:
              "Agent number must be exactly 12 characters (MPP + 2-letter role + 2-digit year + 4-digit SSN)",
          });
        }

        // Check for duplicate agent numbers
        const existingUser =
          await storage.getUserByAgentNumber(trimmedAgentNumber);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({
            success: false,
            error: "Agent number already in use",
          });
        }
      }

      const result = await storage.updateUser(userId, {
        agentNumber: agentNumber?.trim() || null,
        updatedAt: new Date(),
      });

      res.json(result);
    } catch (error) {
      console.error("Error updating agent number:", error);
      res.status(500).json({
        message: "Failed to update agent number",
        details: error.message,
      });
    }
  },
);

// Suspend user endpoint
router.put(
  "/api/admin/users/:userId/suspend",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { reason } = req.body;

      // Also deactivate any active subscriptions
      const userSubscriptions = await storage.getUserSubscriptions(userId);
      for (const subscription of userSubscriptions) {
        if (subscription.status === "active") {
          await storage.updateSubscription(subscription.id, {
            status: "suspended",
            pendingReason: "admin_suspended",
            pendingDetails: reason || "Account suspended by administrator",
            updatedAt: new Date(),
          });
        }
      }

      const updatedUser = await storage.updateUser(userId, {
        isActive: false,
        approvalStatus: "suspended",
        rejectionReason: reason || "Account suspended by administrator",
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error suspending user:", error);
      res.status(500).json({ message: "Failed to suspend user" });
    }
  },
);

// Reactivate user endpoint
router.put(
  "/api/admin/users/:userId/reactivate",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { reactivateSubscriptions } = req.body;

      // Reactivate the user account
      const updatedUser = await storage.updateUser(userId, {
        isActive: true,
        approvalStatus: "approved",
        approvedAt: new Date(),
        approvedBy: req.user!.id,
        rejectionReason: null,
        updatedAt: new Date(),
      });

      // Optionally reactivate suspended subscriptions
      if (reactivateSubscriptions) {
        const userSubscriptions = await storage.getUserSubscriptions(userId);
        for (const subscription of userSubscriptions) {
          if (
            subscription.status === "suspended" ||
            subscription.status === "cancelled"
          ) {
            await storage.updateSubscription(subscription.id, {
              status: "active",
              pendingReason: null,
              pendingDetails: null,
              updatedAt: new Date(),
            });
          }
        }
      }

      res.json(updatedUser);
    } catch (error) {
      console.error("Error reactivating user:", error);
      res.status(500).json({ message: "Failed to reactivate user" });
    }
  },
);

// Assign agent number endpoint
router.put(
  "/api/admin/users/:userId/assign-agent-number",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const { agentNumber } = req.body;

      if (!agentNumber) {
        return res.status(400).json({ message: "Agent number is required" });
      }

      // Check if agent number is already taken
      const existingUser = await storage.getUserByAgentNumber(agentNumber);
      if (existingUser && existingUser.id !== userId) {
        return res
          .status(400)
          .json({ message: "Agent number already assigned to another user" });
      }

      // Update user with new agent number
      const updatedUser = await storage.updateUser(userId, {
        agentNumber: agentNumber,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error assigning agent number:", error);
      res.status(500).json({ message: "Failed to assign agent number" });
    }
  },
);

router.get(
  "/api/admin/leads",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      console.log("[Admin Leads API] Fetching leads with filters:", req.query);
      const { status, assignedAgentId } = req.query;

      // Use the storage layer's getAllLeads function which handles mapping correctly
      const leads = await storage.getAllLeads(
        (status as string) || undefined,
        (assignedAgentId as string) || undefined,
      );

      console.log(`[Admin Leads API] Found ${leads.length} leads`);

      // The storage layer already handles the snake_case to camelCase mapping
      res.json(leads);
    } catch (error: any) {
      console.error("[Admin Leads API] Error fetching leads:", error);
      res.status(500).json({
        message: "Failed to fetch leads",
        error: error.message,
      });
    }
  },
);

// Add a members-only endpoint
router.get(
  "/api/admin/members",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!hasAgentOrAdminAccess(req.user!.role)) {
      return res
        .status(403)
        .json({ message: "Admin or agent access required" });
    }

    try {
      console.log("[Admin Members API] Fetching members only...");
      const membersResult = await storage.getMembersOnly();

      console.log(
        `[Admin Members API] Found ${membersResult.users.length} members`,
      );
      res.json(membersResult);
    } catch (error: any) {
      console.error("[Admin Members API] Error fetching members:", error);
      res.status(500).json({
        message: "Failed to fetch members",
        error: error.message,
      });
    }
  },
);

router.get(
  "/api/admin/agents",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const agents = await storage.getAgents();
      res.json(agents);
    } catch (error) {
      console.error("Error fetching agents:", error);
      res.status(500).json({ message: "Failed to fetch agents" });
    }
  },
);

// Get all agents (for enrollment agent selection) - accessible by all authenticated users
router.get("/api/agents", authenticateToken, async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const agents = await storage.getAgents();
    
    // Return basic agent info for selection dropdowns
    const agentList = agents.map(agent => ({
      id: agent.id,
      firstName: agent.firstName,
      lastName: agent.lastName,
      agentNumber: agent.agentNumber,
      email: agent.email,
      isActive: agent.isActive
    })).filter(agent => agent.isActive); // Only return active agents

    res.json(agentList);
  } catch (error: any) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ message: "Failed to fetch agents", error: error.message });
  }
});

router.get(
  "/api/admin/login-sessions",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 LOGIN SESSIONS ROUTE HIT");
    console.log("User:", req.user?.email);
    console.log("Role:", req.user?.role);
    console.log("Headers:", req.headers.authorization);

    if (!isAdmin(req.user!.role)) {
      console.log("❌ Access denied - not admin");
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      console.log("✅ Calling getAllLoginSessions...");
      const { limit = "50" } = req.query;
      const loginSessions = await storage.getAllLoginSessions(parseInt(limit as string));
      console.log("✅ Got", loginSessions?.length || 0, "login sessions");
      res.json(loginSessions);
    } catch (error) {
      console.error("❌ Error fetching login sessions:", error);
      res.status(500).json({ message: "Failed to fetch login sessions" });
    }
  },
);

router.put(
  "/api/admin/leads/:leadId/assign",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { leadId } = req.params;
      const { agentId } = req.body;

      const result = await storage.assignLead(parseInt(leadId), agentId);
      res.json(result);
    } catch (error) {
      console.error("Error assigning lead:", error);
      res.status(500).json({ message: "Failed to assign lead" });
    }
  },
);

router.get(
  "/api/admin/enrollments",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { startDate, endDate, agentId } = req.query;

      let enrollments;
      if (agentId && agentId !== "all") {
        enrollments = await storage.getEnrollmentsByAgent(
          agentId as string,
          startDate as string,
          endDate as string,
        );
      } else {
        enrollments = await storage.getAllEnrollments(
          startDate as string,
          endDate as string,
        );
      }

      // Ensure we always return an array
      const safeEnrollments = Array.isArray(enrollments) ? enrollments : [];
      res.json(safeEnrollments);
    } catch (error) {
      console.error("Error fetching enrollments:", error);
      res
        .status(500)
        .json({ message: "Failed to fetch enrollments", error: error.message });
    }
  },
);

router.get(
  "/api/admin/enrollment/:enrollmentId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const enrollmentId = Number(req.params.enrollmentId);
    if (!Number.isFinite(enrollmentId)) {
      return res.status(400).json({ message: "Invalid enrollment ID" });
    }

    try {
      const enrollment = await storage.getEnrollmentDetails(enrollmentId);
      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }
      res.json(enrollment);
    } catch (error: any) {
      console.error("Error fetching enrollment details:", error);
      res.status(500).json({ message: "Failed to load enrollment", error: error.message });
    }
  },
);

router.patch(
  "/api/admin/enrollment/:enrollmentId/contact",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const enrollmentId = Number(req.params.enrollmentId);
    if (!Number.isFinite(enrollmentId)) {
      return res.status(400).json({ message: "Invalid enrollment ID" });
    }

    const { email, phone, emergencyContactName, emergencyContactPhone } = req.body || {};
    const updates: Record<string, any> = {};

    if (typeof email === "string") {
      updates.email = email.trim();
    }
    if (typeof phone === "string") {
      updates.phone = phone;
    }
    if (typeof emergencyContactName === "string") {
      updates.emergencyContactName = emergencyContactName.trim();
    }
    if (typeof emergencyContactPhone === "string") {
      updates.emergencyContactPhone = emergencyContactPhone;
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No contact fields provided" });
    }

    try {
      await storage.updateMember(enrollmentId, updates);
      const enrollment = await storage.getEnrollmentDetails(enrollmentId);
      res.json({ success: true, enrollment });
    } catch (error: any) {
      console.error("Error updating enrollment contact:", error);
      res.status(500).json({ message: "Failed to update contact", error: error.message });
    }
  },
);

router.patch(
  "/api/admin/enrollment/:enrollmentId/address",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const enrollmentId = Number(req.params.enrollmentId);
    if (!Number.isFinite(enrollmentId)) {
      return res.status(400).json({ message: "Invalid enrollment ID" });
    }

    const { address, address2, city, state, zipCode } = req.body || {};
    const updates: Record<string, any> = {};

    if (typeof address === "string") {
      updates.address = address.trim();
    }
    if (typeof address2 === "string") {
      updates.address2 = address2.trim();
    }
    if (typeof city === "string") {
      updates.city = city.trim();
    }
    if (typeof state === "string") {
      updates.state = state.trim();
    }
    if (typeof zipCode === "string") {
      updates.zipCode = zipCode.trim();
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "No address fields provided" });
    }

    try {
      await storage.updateMember(enrollmentId, updates);
      const enrollment = await storage.getEnrollmentDetails(enrollmentId);
      res.json({ success: true, enrollment });
    } catch (error: any) {
      console.error("Error updating enrollment address:", error);
      res.status(500).json({ message: "Failed to update address", error: error.message });
    }
  },
);

router.patch(
  "/api/admin/members/:memberId/status",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { memberId } = req.params;
    const { status, reason } = req.body || {};
    const allowedStatuses = [
      "pending_activation",
      "active",
      "inactive",
      "cancelled",
      "suspended",
      "archived",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid status value",
        allowedStatuses,
      });
    }

    try {
      const updatedMember = await storage.updateMemberStatus(memberId, status, {
        reason,
      });

      res.json({
        message: `Member status updated to ${status}`,
        member: updatedMember,
      });
    } catch (error: any) {
      console.error("Error updating member status:", error);
      res.status(500).json({
        message: "Failed to update member status",
        error: error.message,
      });
    }
  },
);

router.post(
  "/api/admin/members/:memberId/activate-now",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const { memberId } = req.params;
    const { note } = req.body || {};

    try {
      const member = await storage.activateMembershipNow(memberId, {
        note,
        initiatedBy: req.user?.email,
      });

      res.json({
        message: "Membership activated immediately",
        member,
      });
    } catch (error: any) {
      console.error("Error activating membership immediately:", error);
      res.status(500).json({
        message: "Failed to activate membership",
        error: error.message,
      });
    }
  },
);

router.get(
  "/api/admin/analytics",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { days = "30", refresh = "false" } = req.query;

      console.log(
        `[Analytics API] Fetching analytics for ${days} days (refresh: ${refresh})`,
      );

      // Get comprehensive analytics data
      const analytics = await storage.getComprehensiveAnalytics(
        parseInt(days as string),
      );

      console.log("[Analytics API] Analytics overview:", {
        totalMembers: analytics.overview?.totalMembers || 0,
        activeSubscriptions: analytics.overview?.activeSubscriptions || 0,
        monthlyRevenue: analytics.overview?.monthlyRevenue || 0,
        recentEnrollments: analytics.recentEnrollments?.length || 0,
      });

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res
        .status(500)
        .json({ message: "Failed to fetch analytics", error: error.message });
    }
  },
);

router.get("/api/agents", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const agents = await storage.getAgents();
    res.json(agents);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ message: "Failed to fetch agents" });
  }
});

router.post(
  "/api/admin/reports/export",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { reportType, format, timeRange, email, data } = req.body;

      if (email) {
        // Send report via email
        const emailContent = await generateReportEmail(
          reportType,
          data,
          format,
        );

        // Here you would integrate with your email service
        // For now, we'll just simulate success
        console.log(`Sending ${reportType} report to ${email}`);

        res.json({ message: "Report sent successfully" });
      } else {
        // Generate file for download
        const fileBuffer = await generateReportFile(reportType, data, format);

        const contentTypes = {
          csv: "text/csv",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          pdf: "application/pdf",
        };

        res.setHeader(
          "Content-Type",
          contentTypes[format as keyof typeof contentTypes],
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${reportType}_report.${format}"`,
        );
        res.send(fileBuffer);
      }
    } catch (error) {
      console.error("Error exporting report:", error);
      res.status(500).json({ message: "Failed to export report" });
    }
  },
);

async function generateReportEmail(
  reportType: string,
  data: any,
  format: string,
): Promise<string> {
  // Generate email content based on report type
  return `Your ${reportType} report is ready and has been generated in ${format} format.`;
}

async function generateReportFile(
  reportType: string,
  data: any,
  format: string,
): Promise<Buffer> {
  if (format === "csv") {
    return generateCSV(reportType, data);
  } else if (format === "xlsx") {
    return generateExcel(reportType, data);
  } else if (format === "pdf") {
    return generatePDF(reportType, data);
  }
  throw new Error("Unsupported format");
}

function generateCSV(reportType: string, data: any): Buffer {
  let csvContent = "";

  if (reportType === "members" && Array.isArray(data)) {
    csvContent =
      "Name,Email,Phone,Plan,Status,Enrolled Date,Total Paid,Agent\n";
    data.forEach((member: any) => {
      csvContent += `"${member.firstName} ${member.lastName}",${member.email},${member.phone},${member.planName},${member.status},${member.enrolledDate},${member.totalPaid},${member.agentName}\n`;
    });
  } else if (reportType === "agents" && Array.isArray(data)) {
    csvContent =
      "Agent Name,Agent Number,Total Enrollments,Monthly Enrollments,Total Commissions,Paid Commissions,Pending Commissions,Conversion Rate\n";
    data.forEach((agent: any) => {
      csvContent += `${agent.agentName},${agent.agentNumber},${agent.totalEnrollments},${agent.monthlyEnrollments},${agent.totalCommissions},${agent.paidCommissions},${agent.pendingCommissions},${agent.conversionRate}%\n`;
    });
  } else if (reportType === "commissions" && Array.isArray(data)) {
    csvContent =
      "Agent,Agent Number,Member,Plan,Commission Amount,Plan Cost,Status,Payment Status,Created Date\n";
    data.forEach((commission: any) => {
      csvContent += `${commission.agentName},${commission.agentNumber},${commission.memberName},${commission.planName},${commission.commissionAmount},${commission.totalPlanCost},${commission.status},${commission.paymentStatus},${commission.createdDate}\n`;
    });
  }

  return Buffer.from(csvContent);
}

function generateExcel(reportType: string, data: any): Buffer {
  // For now, return CSV format - in production you'd use a library like xlsx
  return generateCSV(reportType, data);
}

function generatePDF(reportType: string, data: any): Buffer {
  // For now, return CSV format - in production you'd use a library like puppeteer or pdfkit
  return generateCSV(reportType, data);
}

router.put(
  "/api/admin/users/:userId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAdmin(req.user!.role)) {
      return res.status(403).json({ message: "Admin access required" });
    }

    try {
      const { userId } = req.params;
      const updateData = req.body;

      const updatedUser = await storage.updateUser(userId, {
        ...updateData,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  },
);

// Agent routes
router.get(
  "/api/agent/enrollments",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 AGENT ENROLLMENTS ROUTE HIT - User:", req.user?.email, "Role:", req.user?.role);

    if (!hasAgentOrAdminAccess(req.user!.role)) {
      console.log("❌ Access denied - not agent or admin");
      return res.status(403).json({ message: "Agent or admin access required" });
    }

    try {
      const { startDate, endDate } = req.query;
      let enrollments;

      if (isAdmin(req.user!.role)) {
        // Admin and super_admin see all enrollments
        enrollments = await storage.getAllEnrollments(
          startDate as string, 
          endDate as string
        );
      } else {
        // Agent sees only their enrollments
        enrollments = await storage.getAgentEnrollments(
          req.user!.id,
          startDate as string,
          endDate as string
        );
      }

      console.log("✅ Got", enrollments?.length || 0, "enrollments");
      res.json(enrollments);
    } catch (error) {
      console.error("❌ Error fetching agent enrollments:", error);
      res.status(500).json({ message: "Failed to fetch enrollments" });
    }
  },
);

// Note: /api/agent/commissions route is handled later in the file with proper storage function calls

// Agent member management routes
router.get(
  "/api/agent/members",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAgentRole(req.user!.role)) {
      return res.status(403).json({ message: "Agent access required" });
    }

    try {
      // Get all users enrolled by this agent plus users they have commissions for
      const enrolledUsers = await storage.getAgentEnrollments(
        req.user!.id,
        undefined,
        undefined,
        req.user!.agentNumber || null,
      );

      // Get users from commissions in Supabase
      const { data: agentCommissions } = await supabase
        .from('agent_commissions')
        .select('member_id')
        .eq('agent_id', req.user!.id);
      
      const commissionUserIds = agentCommissions?.map((c) => c.member_id) || [];

      // Fetch additional users from commissions that weren't directly enrolled
      const additionalUsers = [];
      for (const userId of commissionUserIds) {
        if (!enrolledUsers.find((u) => u.id === userId)) {
          const user = await storage.getUser(userId);
          if (user) additionalUsers.push(user);
        }
      }

      const allMembers = [...enrolledUsers, ...additionalUsers];

      // Get subscription info for each member
      const membersWithDetails = await Promise.all(
        allMembers.map(async (member) => {
          const subscription = await storage.getUserSubscription(member.id);
          const familyMembers = await storage.getFamilyMembers(member.id);

          return {
            ...member,
            subscription,
            familyMembers,
            totalFamilyMembers: familyMembers.length,
          };
        }),
      );

      res.json(membersWithDetails);
    } catch (error) {
      console.error("Error fetching agent members:", error);
      res.status(500).json({ message: "Failed to fetch agent members" });
    }
  },
);

// Agent failed payments route - allows agents to see and retry failed payments for their members
router.get(
  "/api/agent/failed-payments",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAgentRole(req.user!.role)) {
      return res.status(403).json({ message: "Agent access required" });
    }

    try {
      const failedPayments = await storage.getAgentFailedPayments(req.user!.id);

      // Format and enrich the response
      const formattedPayments = failedPayments.map((payment) => ({
        id: payment.id,
        transactionId: payment.transaction_id,
        amount: parseFloat(payment.amount),
        status: payment.status,
        paymentMethod: payment.payment_method,
        failureReason: payment.metadata?.StatusMessage || 'Payment declined',
        createdAt: payment.created_at,
        updatedAt: payment.updated_at,
        member: {
          id: payment.member_id,
          firstName: payment.member_first_name,
          lastName: payment.member_last_name,
          email: payment.member_email,
          phone: payment.member_phone,
          customerNumber: payment.member_customer_number,
          monthlyPrice: parseFloat(payment.member_monthly_price || payment.plan_monthly_price || '0')
        },
        plan: {
          name: payment.plan_name,
          monthlyPrice: parseFloat(payment.plan_monthly_price || '0')
        },
        commission: {
          amount: payment.commission_amount ? parseFloat(payment.commission_amount) : null,
          status: payment.commission_status
        },
        canRetry: payment.status === 'failed' || payment.status === 'declined',
        metadata: payment.metadata
      }));

      res.json({
        success: true,
        payments: formattedPayments,
        total: formattedPayments.length
      });
    } catch (error) {
      console.error("Error fetching agent failed payments:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch failed payments" 
      });
    }
  },
);


router.get(
  "/api/agent/members/:memberId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAgentRole(req.user!.role)) {
      return res.status(403).json({ message: "Agent access required" });
    }

    try {
      const { memberId } = req.params;

      // Verify agent has access to this member
      const member = await storage.getUser(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      // Check if agent enrolled this user or has commissions for them
      const hasAccess =
        member.enrolledByAgentId === req.user!.id ||
        (await storage.getCommissionByUserId(memberId, req.user!.id));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this member" });
      }

      // Get complete member details
      const subscription = await storage.getUserSubscription(memberId);
      const familyMembers = await storage.getFamilyMembers(memberId);
      const payments = await storage.getUserPayments(memberId);

      res.json({
        ...member,
        subscription,
        familyMembers,
        payments: payments.slice(0, 10), // Last 10 payments
      });
    } catch (error) {
      console.error("Error fetching member details:", error);
      res.status(500).json({ message: "Failed to fetch member details" });
    }
  },
);

router.put(
  "/api/agent/members/:memberId",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAgentRole(req.user!.role)) {
      return res.status(403).json({ message: "Agent access required" });
    }

    try {
      const { memberId } = req.params;
      const updateData = req.body;

      // Verify agent has access to this member
      const member = await storage.getUser(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      const hasAccess =
        member.enrolledByAgentId === req.user!.id ||
        (await storage.getCommissionByUserId(memberId, req.user!.id));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this member" });
      }

      // Remove protected fields that agents cannot modify
      delete updateData.id;
      delete updateData.email;
      delete updateData.role;
      delete updateData.approvalStatus;
      delete updateData.isActive;
      delete updateData.createdAt;
      delete updateData.enrolledByAgentId;
      // EPX payment system - no legacy payment fields to exclude

      // Validate phone number format if provided
      if (updateData.phone) {
        const phoneRegex =
          /^\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}$/;
        if (!phoneRegex.test(updateData.phone)) {
          return res
            .status(400)
            .json({ message: "Invalid phone number format" });
        }
      }

      const updatedMember = await storage.updateUser(memberId, {
        ...updateData,
        updatedAt: new Date(),
      });

      // Log the agent action
      console.log(
        `Agent ${req.user!.email} updated member ${memberId}:`,
        updateData,
      );

      res.json(updatedMember);
    } catch (error) {
      console.error("Error updating member:", error);
      res.status(500).json({ message: "Failed to update member" });
    }
  },
);

router.put(
  "/api/agent/members/:memberId/subscription",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAgentRole(req.user!.role)) {
      return res.status(403).json({ message: "Agent access required" });
    }

    try {
      const { memberId } = req.params;
      const { planId, memberType } = req.body;

      // Verify agent has access to this member
      const member = await storage.getUser(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      const hasAccess =
        member.enrolledByAgentId === req.user!.id ||
        (await storage.getCommissionByUserId(memberId, req.user!.id));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this member" });
      }

      // Get current subscription
      const currentSubscription = await storage.getUserSubscription(memberId);
      if (!currentSubscription) {
        return res
          .status(404)
          .json({ message: "No active subscription found" });
      }

      // Get new plan details
      const newPlan = planId ? await storage.getPlan(planId) : null;
      if (!newPlan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      // Update subscription plan but preserve billing dates
      const updatedSubscription = await storage.updateSubscription(
        currentSubscription.id,
        {
          planId: newPlan.id,
          amount: newPlan.price,
          updatedAt: new Date(),
          // Note: NOT updating nextBillingDate, currentPeriodStart, currentPeriodEnd
        },
      );

      // Update member type in user record if provided
      if (memberType) {
        await storage.updateUser(memberId, {
          memberType,
          updatedAt: new Date(),
        });
      }

      // Log the agent action
      console.log(
        `Agent ${req.user!.email} updated subscription for member ${memberId}:`,
        {
          oldPlan: currentSubscription.planId,
          newPlan: newPlan.id,
          memberType,
        },
      );

      res.json({
        subscription: updatedSubscription,
        plan: newPlan,
        message: "Subscription updated successfully. Billing date unchanged.",
      });
    } catch (error) {
      console.error("Error updating member subscription:", error);
      res.status(500).json({ message: "Failed to update subscription" });
    }
  },
);

router.post(
  "/api/agent/members/:memberId/family",
  authenticateToken,
  async (req: AuthRequest, res) => {
    if (!isAgentRole(req.user!.role)) {
      return res.status(403).json({ message: "Agent access required" });
    }

    try {
      const { memberId } = req.params;
      const familyMemberData = req.body;

      // Verify agent has access to this member
      const member = await storage.getUser(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      const hasAccess =
        member.enrolledByAgentId === req.user!.id ||
        (await storage.getCommissionByUserId(memberId, req.user!.id));

      if (!hasAccess) {
        return res
          .status(403)
          .json({ message: "Access denied to this member" });
      }

      const newFamilyMember = await storage.addFamilyMember({
        ...familyMemberData,
        primaryUserId: memberId,
      });

      // Log the agent action
      console.log(
        `Agent ${req.user!.email} added family member for ${memberId}:`,
        familyMemberData.firstName,
        familyMemberData.lastName,
      );

      res.status(201).json(newFamilyMember);
    } catch (error) {
      console.error("Error adding family member:", error);
      res.status(500).json({ message: "Failed to add family member" });
    }
  },
);

router.get(
  "/api/agent/stats",
  authenticateToken,
  async (req: AuthRequest, res) => {
    console.log("🔍 AGENT STATS ROUTE HIT - User:", req.user?.email, "Role:", req.user?.role);

    if (!hasAgentOrAdminAccess(req.user!.role)) {
      console.log("❌ Access denied - not agent/admin/super_admin");
      return res.status(403).json({ message: "Agent or admin access required" });
    }

    try {
      const period = typeof req.query.period === 'string' ? req.query.period : undefined;
      const customStart = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const customEnd = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const requestedAgentIdRaw = req.query.agentId;
      const requestedAgentId = typeof requestedAgentIdRaw === 'string' ? requestedAgentIdRaw : undefined;

      const { start, end } = getDateRangeFromQuery(period, customStart, customEnd);

      let targetAgentId = req.user!.id;
      let targetAgentNumber = req.user!.agentNumber || null;

      if (requestedAgentId && requestedAgentId !== targetAgentId) {
        if (!isAdmin(req.user!.role)) {
          return res.status(403).json({ message: "Admin access required to view other agents" });
        }

        const targetAgent = await storage.getUser(requestedAgentId);
        if (!targetAgent) {
          return res.status(404).json({ message: "Requested agent not found" });
        }

        targetAgentId = targetAgent.id;
        targetAgentNumber = targetAgent.agentNumber || null;
      }

      console.log('[Agent Stats] Fetching stats for user:', {
        userId: targetAgentId,
        email: req.user?.email,
        role: req.user?.role,
        agentNumber: targetAgentNumber,
        period,
        start: start?.toISOString() || null,
        end: end?.toISOString() || null,
      });

      let memberQuery = supabase.from('members').select('*');
      if (targetAgentId && targetAgentNumber) {
        memberQuery = memberQuery.or(`enrolled_by_agent_id.eq.${targetAgentId},agent_number.eq.${targetAgentNumber}`);
      } else if (targetAgentId) {
        memberQuery = memberQuery.eq('enrolled_by_agent_id', targetAgentId);
      } else if (targetAgentNumber) {
        memberQuery = memberQuery.eq('agent_number', targetAgentNumber);
      }

      const { data: agentMembers, error: memberError } = await memberQuery;
      if (memberError) {
        console.error('[Agent Stats] Failed to fetch members:', memberError);
        return res.status(500).json({ message: 'Failed to fetch agent members' });
      }

      const allMembers = agentMembers || [];
      const filteredMembers = filterRecordsByDate(allMembers, start, end);

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthStart.setHours(0, 0, 0, 0);
      const yearStart = new Date(now.getFullYear(), 0, 1);

      const membersThisMonth = allMembers.filter((member: any) => new Date(member.created_at) >= monthStart);
      const membersThisYear = allMembers.filter((member: any) => new Date(member.created_at) >= yearStart);

      const activeMembers = allMembers.filter((member: any) =>
        member.status === 'active' || member.status === 'pending_activation'
      ).length;

      const pendingEnrollments = filteredMembers.filter((member: any) =>
        member.status && member.status.toLowerCase().includes('pending')
      ).length;

      const { data: agentCommissions, error: commissionError } = await supabase
        .from('agent_commissions')
        .select('*')
        .eq('agent_id', targetAgentId);

      if (commissionError) {
        console.error('[Agent Stats] Failed to fetch commissions:', commissionError);
        return res.status(500).json({ message: 'Failed to fetch agent commissions' });
      }

      const allCommissions = agentCommissions || [];
      const filteredCommissions = filterRecordsByDate(allCommissions, start, end);
      const commissionsThisMonth = allCommissions.filter((commission: any) => new Date(commission.created_at) >= monthStart);
      const commissionsThisYear = allCommissions.filter((commission: any) => new Date(commission.created_at) >= yearStart);

      const roundCurrency = (value: number) => Number((value || 0).toFixed(2));

      const totalRevenue = roundCurrency(sumEnrollmentRevenue(filteredMembers));
      const totalRevenueAllTime = roundCurrency(sumEnrollmentRevenue(allMembers));
      const monthlyRevenue = roundCurrency(sumEnrollmentRevenue(membersThisMonth));
      const yearlyRevenue = roundCurrency(sumEnrollmentRevenue(membersThisYear));
      const averageRevenuePerMember = filteredMembers.length > 0
        ? roundCurrency(totalRevenue / filteredMembers.length)
        : 0;

      const totalCommissionsAmount = roundCurrency(sumCommissionAmounts(filteredCommissions));
      const totalCommissionsAllTime = roundCurrency(sumCommissionAmounts(allCommissions));
      const monthlyCommissionsAmount = roundCurrency(sumCommissionAmounts(commissionsThisMonth));
      const yearlyCommissionsAmount = roundCurrency(sumCommissionAmounts(commissionsThisYear));
      const paidCommissionsAmount = roundCurrency(sumCommissionAmounts(allCommissions.filter((c: any) => c.payment_status === 'paid')));
      const pendingCommissionsAmount = roundCurrency(sumCommissionAmounts(allCommissions.filter((c: any) => c.payment_status !== 'paid')));

      // Get plan distribution for this agent's enrollments
      const planDistribution: { [key: string]: number } = {};
      const coverageDistribution: { [key: string]: number } = {};
      
      // Get plan names from plan_id lookup
      for (const member of allMembers.filter((m: any) => m.status === 'active' || m.status === 'pending_activation')) {
        if (member.plan_id) {
          try {
            const { data: planData } = await supabase
              .from('plans')
              .select('name')
              .eq('id', member.plan_id)
              .single();
            
            if (planData?.name) {
              planDistribution[planData.name] = (planDistribution[planData.name] || 0) + 1;
            }
          } catch (err) {
            console.warn('[Agent Stats] Could not fetch plan name for plan_id:', member.plan_id);
          }
        }
        
        // Coverage type distribution
        if (member.coverage_type) {
          coverageDistribution[member.coverage_type] = (coverageDistribution[member.coverage_type] || 0) + 1;
        }
      }
      
      const planDistributionArray = Object.entries(planDistribution).map(([plan_name, member_count]) => ({
        plan_name,
        member_count
      }));
      
      const coverageDistributionArray = Object.entries(coverageDistribution).map(([coverage_type, count]) => ({
        coverage_type,
        count
      }));

      res.json({
        totalRevenue,
        totalRevenueAllTime,
        monthlyRevenue,
        yearlyRevenue,
        averageRevenuePerMember,
        totalEnrollments: filteredMembers.length,
        totalMembers: allMembers.length,
        monthlyEnrollments: membersThisMonth.length,
        yearlyEnrollments: membersThisYear.length,
        pendingEnrollments,
        activeMembers,
        totalCommissions: totalCommissionsAmount,
        totalCommission: totalCommissionsAllTime,
        monthlyCommissions: monthlyCommissionsAmount,
        monthlyCommission: monthlyCommissionsAmount,
        yearlyCommissions: yearlyCommissionsAmount,
        totalEarned: totalCommissionsAllTime,
        paidCommissions: paidCommissionsAmount,
        pendingCommissions: pendingCommissionsAmount,
        memberGrowth: 0,
        revenueGrowth: 0,
        commissionGrowth: 0,
        activeLeads: 0,
        conversionRate: 0,
        leads: [],
        periodStart: start ? start.toISOString() : null,
        periodEnd: end ? end.toISOString() : null,
        planDistribution: planDistributionArray,
        coverageDistribution: coverageDistributionArray,
      });
    } catch (error) {
      console.error("❌ Error fetching agent stats:", error);
      res.status(500).json({ message: "Failed to fetch agent stats" });
    }
  },
);

// Commission Generation Logic
// This function will be called when a new subscription is created or updated.
// It calculates and creates commission records for agents.
router.post(
  "/api/commissions/generate",
  authenticateToken,
  async (req: AuthRequest, res) => {
    // Only admins can trigger commission generation directly, but the logic
    // should also be callable from subscription creation/updates.
    if (!isAdmin(req.user!.role)) {
      return res
        .status(403)
        .json({ message: "Admin access required to generate commissions" });
    }

    try {
      const {
        subscriptionId,
        userId,
        enrolledByAgentId,
        planName,
        memberType,
      } = req.body;

      if (!subscriptionId || !userId || !planName || !memberType) {
        return res
          .status(400)
          .json({
            message:
              "Missing required fields: subscriptionId, userId, planName, memberType",
          });
      }

      // Use the helper function to create commission with admin check
      const commissionResult = await createCommissionWithCheck(
        enrolledByAgentId,
        parseInt(subscriptionId),
        userId,
        planName,
        memberType,
      );

      if (commissionResult.skipped) {
        return res
          .status(200)
          .json({
            message: "Commission generation skipped",
            ...commissionResult,
          });
      } else if (commissionResult.error) {
        return res
          .status(500)
          .json({
            message: "Failed to generate commission",
            ...commissionResult,
          });
      } else {
        return res
          .status(201)
          .json({
            message: "Commission generated successfully",
            commission: commissionResult.commission,
          });
      }
    } catch (error) {
      console.error("Error initiating commission generation:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  },
);

// Helper function to create commission with admin check - NEW DUAL-WRITE VERSION
async function createCommissionWithCheck(
  agentId: string | null,
  subscriptionId: number,
  memberId: number,  // Changed from userId to memberId to match schema
  planName: string,
  memberType: string,
  addRxValet: boolean = false,
) {
  try {
    // Get agent profile to check role and agent number
    const agent = agentId ? await storage.getUser(agentId) : null;

    // NOTE: Removed admin/super_admin skip - they can also enroll members and earn commissions
    // All roles (agent, admin, super_admin) with agent numbers can earn commissions

    // Calculate commission using existing logic
    const commissionResult = calculateCommission(planName, memberType, addRxValet);
    if (!commissionResult) {
      console.warn(
        `No commission rate found for plan: ${planName}, member type: ${memberType}`,
      );
      return { skipped: true, reason: "no_commission_rate" };
    }

    // Get agent number from agent profile
    const agentNumber = agent?.agentNumber || 'HOUSE';
    console.log(`[Commission] Agent number for commission: ${agentNumber}`);

    // Determine coverage type from plan name/type
    const planType = getPlanTypeFromMemberType(memberType);
    let coverageType: AgentCommission['coverage_type'] = 'other';
    
    if (planType === 'ACA') coverageType = 'aca';
    else if (planType === 'Medicare Advantage') coverageType = 'medicare_advantage';
    else if (planType === 'Medicare Supplement') coverageType = 'medicare_supplement';
    
    // Prepare commission data for dual-write
    const commissionData: AgentCommission = {
      agent_id: agentId || "HOUSE",
      agent_number: agentNumber, // Include agent number for tracking
      member_id: memberId.toString(), // Convert to string for new schema
      enrollment_id: subscriptionId.toString(), // Link to enrollment
      commission_amount: commissionResult.commission,
      coverage_type: coverageType,
      policy_number: undefined, // To be updated when available
      carrier: undefined, // To be updated when available
      commission_percentage: undefined, // Calculate from commission amount and base premium if needed
      base_premium: commissionResult.totalCost,
      status: 'pending',
      payment_status: 'unpaid'
    };

    console.log('[Commission Dual-Write] Creating commission with data:', commissionData);

    // Create commission directly in Supabase
    const { data: newCommission, error: commissionError } = await supabase
      .from('agent_commissions')
      .insert(commissionData)
      .select()
      .single();

    const result = commissionError ? 
      { success: false, error: commissionError.message } : 
      { success: true, agentCommissionId: newCommission.id };
    
    if (result.success) {
      console.log('[Commission Dual-Write] Success:', result);
      return { 
        success: true, 
        commission: { 
          id: result.agentCommissionId,
          ...commissionData 
        }
      };
    } else {
      console.error('[Commission Dual-Write] Failed:', result.error);
      return { error: result.error };
    }
  } catch (error) {
    console.error("Error creating commission:", error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function registerRoutes(app: any) {

  // Auth middleware - must be after session middleware
  const authMiddleware = async (req: any, res: any, next: any) => {
    if ((req.path.startsWith("/api/auth/") && req.path !== "/api/auth/user") || req.path === "/api/plans") {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      console.warn("[Auth] No authorization token provided for:", req.path);
      return res.status(401).json({ error: "No authorization token provided" });
    }

    const token = authHeader.split(" ")[1];

    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        console.warn("[Auth] Invalid token for:", req.path, error?.message);
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      // Get user data from our database with retry logic
      let userData;
      let retries = 3;
      while (retries > 0) {
        try {
          userData = await storage.getUser(user.id);
          break;
        } catch (dbError) {
          retries--;
          if (retries === 0) {
            console.error("[Auth] Database error after retries:", dbError);
            return res
              .status(500)
              .json({ error: "Database connection failed" });
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      if (!userData) {
        console.warn("[Auth] User not found in database:", user.id);
        return res.status(404).json({ error: "User not found in database" });
      }

      // DEBUG: Log user role for troubleshooting
      console.log('[Auth] User authenticated:', {
        id: userData.id,
        email: userData.email,
        role: userData.role,
        roleType: typeof userData.role,
        roleLength: userData.role?.length,
        roleBytes: userData.role ? Buffer.from(userData.role).toString('hex') : 'null',
        agentNumber: userData.agentNumber,
        path: req.path
      });

      // Check approval status
      if (userData.approvalStatus === "pending") {
        return res.status(403).json({
          error: "Account pending approval",
          requiresApproval: true,
        });
      }

      if (userData.approvalStatus === "rejected") {
        return res.status(403).json({
          error: "Account access denied",
        });
      }

      req.user = userData;
      next();
    } catch (error) {
      console.error("[Auth] Auth middleware error:", error);
      return res.status(500).json({ error: "Authentication failed" });
    }
  };

  // Admin role check middleware
  const adminRequired = (req: any, res: any, next: any) => {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  // Register EPX payment routes FIRST (highest priority)
  // EPX routes are already registered in server/index.ts before registerRoutes() is called
  // Commenting out to avoid duplicate registration
  // app.use(epxHostedRoutes);

  // Use the router for general API routes
  app.use(router);

  // Register Supabase auth routes (after main routes)
  app.use(supabaseAuthRoutes);

  // ============================================================
  // ============================================================
  // MEMBER REGISTRATION ENDPOINT
  // Creates members WITHOUT Supabase Auth (members cannot log in)
  // Customer number auto-generates via database function
  // ============================================================
  app.post("/api/registration", async (req: any, res: any) => {
    console.log("[Registration] Member registration attempt");
    console.log("[Registration] Request body keys:", Object.keys(req.body || {}));
    console.log("[Registration] FULL REQUEST BODY:", JSON.stringify(req.body, null, 2));

    // Add CORS headers for registration endpoint
    const origin = req.headers.origin;
    const allowedOrigins = [
      'https://getmydpc-enrollment-gjk6m.ondigitalocean.app',
      'https://enrollment.getmydpc.com',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5000'
    ];

    if (allowedOrigins.includes(origin as string)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    try {
      const {
        email,
        firstName,
        lastName,
        middleName,
        phone,
        dateOfBirth,
        gender,
        ssn,
        address,
        address2,
        city,
        state,
        zipCode,
        employerName,
        dateOfHire,
        emergencyContactName,
        emergencyContactPhone,
        memberType,
        planStartDate,
        planId,
        coverageType,
        addRxValet,
        totalMonthlyPrice,
        familyMembers,
        termsAccepted,
        privacyAccepted,
        privacyNoticeAcknowledged,
        smsConsent,
        communicationsConsent,
        faqDownloaded,
        enrolledByAgentId
      } = req.body;

      // SERVER-SIDE AGENT NUMBER LOOKUP (don't trust client data)
      let agentNumber: string | null = null;
      let agentUser: any = null;
      
      if (enrolledByAgentId) {
        try {
          agentUser = await storage.getUser(enrolledByAgentId);
          if (agentUser) {
            agentNumber = agentUser.agentNumber || agentUser.agent_number || null;
            console.log(`[Registration] ✅ Agent lookup: ${agentUser.email} → Agent #${agentNumber || 'NONE'}`);
            
            if (!agentNumber) {
              console.error(`[Registration] ❌ CRITICAL: Agent ${enrolledByAgentId} (${agentUser.email}) has NO agent_number assigned!`);
              console.error(`[Registration] Commission will NOT be created without agent number!`);
            }
          } else {
            console.error(`[Registration] ❌ Agent ${enrolledByAgentId} not found in database!`);
          }
        } catch (agentLookupError: any) {
          console.error(`[Registration] ❌ Error looking up agent:`, agentLookupError.message);
        }
      } else {
        console.warn("[Registration] ⚠️  No enrolledByAgentId provided - enrollment will have no agent association");
      }

      console.log("[Registration] Email:", email);
      console.log("[Registration] Extracted Key Fields:", {
        planId: planId,
        planIdType: typeof planId,
        coverageType: coverageType,
        memberType: memberType,
        totalMonthlyPrice: totalMonthlyPrice,
        agentNumber: agentNumber,
        agentEmail: agentUser?.email || 'N/A',
        enrolledByAgentId: enrolledByAgentId,
        addRxValet: addRxValet
      });

      // Basic validation
      const missingFields = [];
      if (!email) missingFields.push("email");
      if (!firstName) missingFields.push("firstName");
      if (!lastName) missingFields.push("lastName");

      if (missingFields.length > 0) {
        console.log("[Registration] Missing fields:", missingFields);
        return res.status(400).json({
          error: "Missing required fields",
          required: ["email", "firstName", "lastName"],
          missing: missingFields
        });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        console.error("[Registration] Invalid email format:", email);
        return res.status(400).json({
          error: "Invalid email format"
        });
      }

      // Check if member already exists
      const normalizedEmail = email.trim().toLowerCase();
      console.log("[Registration] Checking for existing member with email:", normalizedEmail);
      const existingMember = await storage.getMemberByEmail(normalizedEmail);
      console.log("[Registration] Existing member check result:", existingMember ? `Found ID ${existingMember.id}` : "Not found");
      if (existingMember) {
        console.log("[Registration] Member already exists:", existingMember.id, existingMember.customerNumber);
        return res.status(400).json({
          error: "Member already exists with this email"
        });
      }

      console.log("[Registration] Creating member...");
      if (agentNumber) {
        console.log("[Registration] Agent enrollment by:", agentNumber);
      }

      // Calculate membership dates
      const enrollmentDate = new Date();
      const firstPaymentDate = enrollmentDate; // Same as enrollment date
      const membershipStartDate = calculateMembershipStartDate(enrollmentDate);
      
      console.log("[Registration] Date calculations:", {
        enrollmentDate: enrollmentDate.toISOString(),
        firstPaymentDate: firstPaymentDate.toISOString(),
        membershipStartDate: membershipStartDate.toISOString(),
        enrollDay: enrollmentDate.getDate(),
        membershipDay: membershipStartDate.getDate(),
        daysUntilActive: daysUntilMembershipStarts(enrollmentDate, membershipStartDate)
      });

      // Set members to active immediately for commission/revenue tracking
      const initialStatus = 'active';
      console.log("[Registration] Initial member status:", initialStatus);

      // CREATE MEMBER IN MEMBERS TABLE (NOT USERS TABLE!)
      // Users table is for Supabase Auth (agents/admins)
      // Members table is for DPC enrollees (no login access)
      console.log("[Registration] Creating member in members table...");
      
      const member = await storage.createMember({
        email: email.trim().toLowerCase(),
        firstName: firstName?.trim() || "",
        lastName: lastName?.trim() || "",
        middleName: middleName?.trim() || null,
        phone: phone || null,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        ssn: ssn || null,
        address: address?.trim() || null,
        address2: address2?.trim() || null,
        city: city?.trim() || null,
        state: state || null,
        zipCode: zipCode || null,
        employerName: employerName?.trim() || null,
        dateOfHire: dateOfHire || null,
        emergencyContactName: emergencyContactName?.trim() || null,
        emergencyContactPhone: emergencyContactPhone || null,
        memberType: memberType || "member-only",
        planStartDate: planStartDate || null,
        agentNumber: agentNumber || null,
        enrolledByAgentId: enrolledByAgentId || null,
        enrollmentDate: enrollmentDate,
        firstPaymentDate: firstPaymentDate,
        membershipStartDate: membershipStartDate,
        isActive: true, // Active immediately for commission tracking
        status: 'active', // Active immediately
        planId: planId ? parseInt(planId) : null,
        coverageType: coverageType || memberType || "member-only",
        totalMonthlyPrice: totalMonthlyPrice ? parseFloat(totalMonthlyPrice) : null,
        addRxValet: addRxValet || false, // ProChoice Rx add-on ($21/month)
      });

      if (!member) {
        console.error("[Registration] ❌ Member creation failed");
        throw new Error(`Member creation failed`);
      }

      console.log("[Registration] Member created:", member.id, member.customerNumber);
      console.log("[Registration] Member object keys:", Object.keys(member));
      console.log("[Registration] Member name fields:", {
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        hasFirstName: !!member.firstName,
        hasLastName: !!member.lastName,
        firstNameValue: JSON.stringify(member.firstName),
        lastNameValue: JSON.stringify(member.lastName)
      });
      console.log("[Registration] Full member object:", JSON.stringify(member, null, 2));

      // Create subscription if plan is selected
      let subscriptionId = null;
      console.log("[Subscription Check] planId:", planId, "totalMonthlyPrice:", totalMonthlyPrice);
      console.log("[Subscription Check] Will create subscription:", !!(planId && totalMonthlyPrice));
      
      if (planId && totalMonthlyPrice) {
        try {
          console.log("[Registration] Creating subscription with planId:", planId);
          
          const subscriptionData = {
            member_id: member.id, // Use member_id, not user_id (subscriptions reference members table)
            plan_id: parseInt(planId),
            status: "pending_payment",
            amount: totalMonthlyPrice,
            start_date: new Date().toISOString(),
            next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          };

          const { data: subscription, error: subscriptionError } = await supabase
            .from('subscriptions')
            .insert(subscriptionData)
            .select()
            .single();

          if (subscriptionError) {
            console.error("[Registration] Subscription creation failed:", subscriptionError);
            // Continue with registration even if subscription fails
          } else {
            subscriptionId = subscription.id;
            console.log("[Registration] Subscription created:", subscription.id);
          }
        } catch (subError) {
          console.error("[Registration] Error creating subscription:", subError);
          // Continue with registration even if subscription fails
        }
      } else {
        console.warn("[Registration] ⚠️  Subscription NOT created - missing planId or totalMonthlyPrice");
      }

      // Create commission if enrolled by agent
      console.log("[Commission Check] agentNumber:", agentNumber);
      console.log("[Commission Check] enrolledByAgentId:", enrolledByAgentId);
      console.log("[Commission Check] planId:", planId);
      console.log("[Commission Check] subscriptionId:", subscriptionId);
      console.log("[Commission Check] coverageType:", coverageType);
      console.log("[Commission Check] memberType:", memberType);
      console.log("[Commission Check] totalMonthlyPrice:", totalMonthlyPrice);
      
      // Commission creation - only requires agent info and coverage type
      // planId is optional - we can infer plan from totalMonthlyPrice or use default
      if (agentNumber && enrolledByAgentId && (coverageType || memberType)) {
        try {
          console.log("[Registration] Creating commission for agent:", agentNumber);
          
          // LOOK UP AGENT IN SUPABASE DIRECTLY
          console.log("[Commission] Looking up agent by UUID in Supabase:", enrolledByAgentId);
          
          const { data: agentUser, error: agentError } = await supabase
            .from('users')
            .select('*')
            .eq('id', enrolledByAgentId)
            .single();
          
          if (agentError || !agentUser) {
            console.error("[Commission] ❌ Agent not found in Supabase:", enrolledByAgentId, agentError);
            console.warn("[Registration] Commission NOT created - agent user not found");
          } else {
            console.log("[Commission] ✅ Agent found - UUID:", agentUser.id, "Email:", agentUser.email);
            
            let plan = null;
            let planName = 'MyPremierPlan Base'; // Default to full Base plan name
            let planTier = 'Base';
            
            // Try to get plan details if planId is provided
            if (planId) {
              try {
                const { data: planData, error: planError } = await supabase
                  .from('plans')
                  .select('*')
                  .eq('id', parseInt(planId))
                  .single();
                
                if (planData && !planError) {
                  plan = planData;
                  // CRITICAL FIX: Extract plan tier from full plan name
                  // Database has: "MyPremierPlan Base - Member Only"
                  // Calculator expects: "MyPremierPlan Base"
                  let rawPlanName = planData.name || 'MyPremierPlan Base';
                  
                  // Extract tier by removing coverage type suffix (e.g. " - Member Only")
                  if (rawPlanName.includes(' - ')) {
                    planName = rawPlanName.split(' - ')[0].trim();
                    console.log("[Commission] 🔧 Extracted plan tier from:", rawPlanName, "→", planName);
                  } else {
                    planName = rawPlanName;
                  }
                  
                  planTier = planName.includes('Elite') ? 'Elite' : planName.includes('Plus') ? 'Plus' : 'Base';
                  console.log("[Commission] ✅ Plan found from planId:", planName, "(Tier:", planTier + ")");
                } else {
                  console.warn("[Commission] ⚠️ Could not fetch plan from Supabase, using defaults");
                }
              } catch (planError) {
                console.warn("[Commission] ⚠️ Could not fetch plan by ID, using defaults");
              }
            } else {
              // Infer plan from price if planId not provided (USE FULL PLAN NAMES)
              console.log("[Commission] No planId provided, inferring from totalMonthlyPrice:", totalMonthlyPrice);
              if (totalMonthlyPrice) {
                const basePrice = totalMonthlyPrice / 1.04; // Remove 4% admin fee
                console.log("[Commission] Base price (minus 4% fee):", basePrice);
                
                if (basePrice >= 70) {
                  planName = 'MyPremierPlan Elite';
                  planTier = 'Elite';
                } else if (basePrice >= 50) {
                  planName = 'MyPremierPlan+';
                  planTier = 'Plus';
                } else {
                  planName = 'MyPremierPlan Base';
                  planTier = 'Base';
                }
                console.log("[Commission] ✅ Inferred plan from price:", planName, "(Tier:", planTier + ")");
              }
            }
            
            // Calculate commission using proper commission structure
            const coverage = coverageType || memberType || 'Member Only';
            console.log("[Commission] Coverage input:", coverage);
            
            const hasRxValet = addRxValet || false;
            const commissionResult = calculateCommission(planName, coverage, hasRxValet);
            
            if (commissionResult) {
              // Map coverage to plan type for better tracking (EE, ESP, ECH, FAM)
              const planType = getPlanTypeFromMemberType(coverage);
              console.log("[Commission] ✅ Mapped coverage '" + coverage + "' to plan type:", planType);
              
              // CREATE COMMISSION DIRECTLY IN SUPABASE (NEW SYSTEM ONLY)
              console.log('[Registration] Creating commission directly in agent_commissions table...');
              
              // Determine coverage type from plan name/type
              // For DPC plans, we use 'other' - in future could add specific DPC enum values
              let coverageTypeEnum: 'aca' | 'medicare_advantage' | 'medicare_supplement' | 'other' = 'other';
              
              const commissionData = {
                agent_id: agentUser.id, // UUID string from users table
                member_id: member.id.toString(), // Store integer ID as string (agent_commissions.member_id is TEXT)
                enrollment_id: subscriptionId ? subscriptionId.toString() : null, // Store subscription ID as string
                commission_amount: commissionResult.commission,
                coverage_type: coverageTypeEnum,
                status: 'pending',
                payment_status: 'unpaid',
                base_premium: commissionResult.totalCost,
                notes: `Plan: ${planName} (${planTier}), Coverage: ${coverage} (${planType}), Base Premium: $${commissionResult.totalCost}${hasRxValet ? ', RxValet: +$' + RX_VALET_COMMISSION : ''}, Total Commission: $${commissionResult.commission}`
              };
              
              console.log('[Registration] Commission data:', JSON.stringify(commissionData, null, 2));
              
              try {
                // Insert directly into Supabase agent_commissions table using service role
                const { data: newCommission, error: commissionError } = await supabase
                  .from('agent_commissions')
                  .insert(commissionData)
                  .select()
                  .single();
                
                if (commissionError) {
                  console.error("[Registration] ❌ Commission creation failed:", commissionError);
                  console.error("[Registration] Commission error details:", commissionError.details);
                } else {
                  const rxValetNote = hasRxValet ? ' (includes $2.50 RxValet commission)' : '';
                  console.log("[Registration] ✅ Commission created: $" + commissionResult.commission.toFixed(2) + " (Plan: " + planName + ", Coverage: " + coverage + ")" + rxValetNote);
                  console.log("[Registration] Commission ID:", newCommission.id);
                  
                  // Check if agent has an upline and create override commission
                  try {
                    const { data: agentData, error: agentError } = await supabase
                      .from('users')
                      .select('upline_agent_id, override_commission_rate, agent_number')
                      .eq('id', agentUser.id)
                      .single();
                    
                    if (agentError) {
                      console.error("[Registration] Could not fetch agent upline data:", agentError);
                    } else if (agentData?.upline_agent_id && agentData.override_commission_rate > 0) {
                      // Create override commission for upline agent
                      const overrideCommissionData = {
                        agent_id: agentData.upline_agent_id,
                        member_id: member.id.toString(),
                        enrollment_id: subscriptionId ? subscriptionId.toString() : null,
                        commission_amount: agentData.override_commission_rate,
                        coverage_type: coverageTypeEnum,
                        status: 'pending',
                        payment_status: 'unpaid',
                        commission_type: 'override',
                        override_for_agent_id: agentUser.id,
                        base_premium: commissionResult.totalCost,
                        notes: `Override for Agent #${agentData.agent_number || agentUser.id} - Plan: ${planName} (${planTier}), Coverage: ${coverage} (${planType}), Override Rate: $${agentData.override_commission_rate}`
                      };
                      
                      const { data: overrideCommission, error: overrideError } = await supabase
                        .from('agent_commissions')
                        .insert(overrideCommissionData)
                        .select()
                        .single();
                      
                      if (overrideError) {
                        console.error("[Registration] ❌ Override commission creation failed:", overrideError);
                      } else {
                        console.log("[Registration] ✅ Override commission created: $" + agentData.override_commission_rate.toFixed(2) + " for upline agent " + agentData.upline_agent_id);
                        console.log("[Registration] Override Commission ID:", overrideCommission.id);
                      }
                    } else {
                      console.log("[Registration] No override commission - agent has no upline or override rate is $0");
                    }
                  } catch (overrideError) {
                    console.error("[Registration] Exception creating override commission:", overrideError);
                    // Don't fail registration if override commission fails
                  }
                }
              } catch (commError) {
                console.error("[Registration] Exception creating commission:", commError);
              }
            } else {
              // ENHANCED ERROR LOGGING: Show exactly why commission calculation failed
              console.error("[Registration] ❌ COMMISSION CALCULATION FAILED");
              console.error("[Registration]   Plan Name Sent:", planName);
              console.error("[Registration]   Coverage Sent:", coverage);
              console.error("[Registration]   RxValet:", hasRxValet);
              console.error("[Registration]   Expected Plan Names: 'MyPremierPlan Base', 'MyPremierPlan+', 'MyPremierPlan Elite'");
              console.error("[Registration]   Expected Coverage Types: 'Member Only', 'Member/Spouse', 'Member/Child', 'Family' (case-insensitive)");
              console.error("[Registration]   Check commissionCalculator.ts for exact matching logic");
              console.warn("[Registration] ⚠️  Commission NOT created - calculateCommission returned null");
            }
          }
        } catch (commError) {
          console.error("[Registration] Error creating commission:", commError);
          console.error("[Registration] Commission error details:", commError instanceof Error ? commError.stack : 'No stack trace');
          // Continue with registration even if commission creation fails
        }
      } else {
          console.error("[Registration] ❌❌❌ COMMISSION NOT CREATED ❌❌❌");
          console.error("[Registration] Missing required values:");
          if (!agentNumber) {
            console.error(`[Registration]   ❌ Missing: agentNumber`);
            if (enrolledByAgentId && agentUser) {
              console.error(`[Registration]      Agent ${agentUser.email} (${enrolledByAgentId}) exists but has no agent_number in database!`);
              console.error(`[Registration]      ACTION REQUIRED: Assign agent number to this user in admin panel`);
            }
          }
          if (!enrolledByAgentId) console.error("[Registration]   ❌ Missing: enrolledByAgentId");
          if (!coverageType && !memberType) console.error("[Registration]   ❌ Missing: coverageType/memberType");
          console.error("[Registration]   📊 Member Info:", {
            memberId: member.id,
            memberEmail: email,
            memberName: `${firstName} ${lastName}`,
            totalMonthlyPrice: totalMonthlyPrice
          });
          console.error("[Registration]   ⚠️  This enrollment will NOT generate commission revenue!");
      }

      // Add family members if provided
      if (familyMembers && Array.isArray(familyMembers)) {
        console.log("[Registration] Processing", familyMembers.length, "family members");
        for (const familyMember of familyMembers) {
          if (familyMember.firstName && familyMember.lastName) {
            try {
              await storage.addFamilyMember({
                ...familyMember,
                primaryMemberId: member.id, // Use primaryMemberId for members (not primaryUserId)
              });
              console.log("[Registration] Added family member:", familyMember.firstName, familyMember.lastName);
            } catch (familyError) {
              console.error("[Registration] Error adding family member:", familyError);
              // Continue with other family members
            }
          }
        }
      }

      console.log("[Registration] Registration completed successfully");

      const responsePayload = {
        success: true,
        message: "Registration successful. Proceeding to payment...",
        member: {
          id: member.id,
          customerNumber: member.customerNumber || member.customer_number,
          memberPublicId: member.memberPublicId || member.member_public_id,
          email: member.email,
          firstName: member.firstName || member.first_name,
          lastName: member.lastName || member.last_name,
          memberType: member.memberType || member.member_type
        },
        enrollment: {
          planId: planId,
          coverageType: coverageType,
          totalMonthlyPrice: totalMonthlyPrice,
          addRxValet: addRxValet
        }
      };

      console.log("[Registration] Response member object:", responsePayload.member);
      console.log("[Registration] Has firstName?", !!responsePayload.member.firstName, "Has lastName?", !!responsePayload.member.lastName);

      res.json(responsePayload);
    } catch (error: any) {
      console.error("[Registration] Error:", error.message);
      console.error("[Registration] Stack:", error.stack);

      // Provide specific error messages
      let errorMessage = "Registration failed";
      let statusCode = 500;

      if (error.message && error.message.includes('duplicate key')) {
        errorMessage = "Member with this information already exists";
        statusCode = 409;
      } else if (error.message && error.message.includes('constraint')) {
        errorMessage = "Invalid data provided for registration";
        statusCode = 400;
      }

      res.status(statusCode).json({
        error: errorMessage,
        message: error.message,
        details: "Internal error"
      });
    }
  });

  // ============================================================
  // AGENT ENROLLMENT ENDPOINT
  // Agents create members and earn commissions
  // ============================================================
  app.post("/api/agent/enrollment", authMiddleware, async (req: any, res: any) => {
    try {
      console.log("[Agent Enrollment] Enrollment by agent:", req.user?.email);

      // Validate agent has permission
      if (!hasAgentOrAdminAccess(req.user?.role)) {
        return res.status(403).json({
          error: "Agent or admin access required"
        });
      }

      const {
        email,
        firstName,
        lastName,
        middleName,
        phone,
        dateOfBirth,
        gender,
        ssn,
        address,
        address2,
        city,
        state,
        zipCode,
        employerName,
        dateOfHire,
        emergencyContactName,
        emergencyContactPhone,
        memberType,
        planStartDate,
        planId,
        planName,
        coverageType,
        addRxValet,
        totalMonthlyPrice,
        familyMembers
      } = req.body;

      // Basic validation
      const missingFields = [];
      if (!email) missingFields.push("email");
      if (!firstName) missingFields.push("firstName");
      if (!lastName) missingFields.push("lastName");
      if (!planId) missingFields.push("planId");

      if (missingFields.length > 0) {
        console.log("[Agent Enrollment] Missing fields:", missingFields);
        return res.status(400).json({
          error: "Missing required fields",
          required: ["email", "firstName", "lastName", "planId"],
          missing: missingFields
        });
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          error: "Invalid email format"
        });
      }

      // Check if member already exists
      const existingMember = await storage.getMemberByEmail(email.trim().toLowerCase());
      if (existingMember) {
        return res.status(400).json({
          error: "Member already exists with this email"
        });
      }

      console.log("[Agent Enrollment] Creating member for agent:", req.user.agentNumber);
      console.log("[Agent Enrollment] Agent user details:", {
        id: req.user.id,
        email: req.user.email,
        agentNumber: req.user.agentNumber,
        role: req.user.role
      });

      // Create member with agent tracking
      // enrolledByAgentId and agentNumber capture who enrolled them
      const member = await storage.createMember({
        email: email.trim().toLowerCase(),
        firstName: firstName?.trim() || "",
        lastName: lastName?.trim() || "",
        middleName: middleName?.trim() || null,
        phone: phone || null,
        dateOfBirth: dateOfBirth || null,
        gender: gender || null,
        ssn: ssn || null,
        address: address?.trim() || null,
        address2: address2?.trim() || null,
        city: city?.trim() || null,
        state: state || null,
        zipCode: zipCode || null,
        employerName: employerName?.trim() || null,
        dateOfHire: dateOfHire || null,
        emergencyContactName: emergencyContactName?.trim() || null,
        emergencyContactPhone: emergencyContactPhone || null,
        memberType: memberType || "member-only",
        planStartDate: planStartDate || null,
        enrolledByAgentId: req.user.id,
        agentNumber: req.user.agentNumber,
        isActive: true,
        emailVerified: false,
        // Confirmation page fields
        planId: planId ? parseInt(planId) : null,
        coverageType: coverageType || memberType || "member-only",
        totalMonthlyPrice: totalMonthlyPrice ? parseFloat(totalMonthlyPrice) : null,
        addRxValet: addRxValet || false
      });

      console.log("[Agent Enrollment] Member created:", member.id, member.customerNumber);

      // Create subscription if plan selected
      let subscription = null;
      if (planId && totalMonthlyPrice) {
        try {
          console.log("[Agent Enrollment] Creating subscription...");
          subscription = await storage.createSubscription({
            userId: null,
            memberId: member.id,
            planId: parseInt(planId),
            status: "pending_payment",
            amount: totalMonthlyPrice,
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            createdAt: new Date(),
            updatedAt: new Date()
          });
          console.log("[Agent Enrollment] Subscription created:", subscription.id);
        } catch (subError) {
          console.error("[Agent Enrollment] Error creating subscription:", subError);
        }
      }

      // Create commission for agent
      if (subscription && subscription.id) {
        try {
          console.log("[Agent Enrollment] Creating commission for agent:", req.user.agentNumber);
          
          const commissionResult = await createCommissionWithCheck(
            req.user.id,       // Agent who enrolled them
            subscription.id,   // Subscription ID
            member.id,         // Member ID (from members table)
            planName || 'MyPremierPlan',
            coverageType || 'Individual'
          );

          if (commissionResult.success) {
            console.log("[Agent Enrollment] Commission created:", commissionResult.commission.id);
          } else {
            console.warn("[Agent Enrollment] Commission not created:", commissionResult.reason);
          }
        } catch (commError) {
          console.error("[Agent Enrollment] Error creating commission:", commError);
          // Continue even if commission fails
        }
      }

      // Add family members if provided
      if (familyMembers && Array.isArray(familyMembers)) {
        console.log("[Agent Enrollment] Processing", familyMembers.length, "family members");
        for (const familyMember of familyMembers) {
          if (familyMember.firstName && familyMember.lastName) {
            try {
              await storage.addFamilyMember({
                ...familyMember,
                primaryMemberId: member.id, // Use primaryMemberId for members (not primaryUserId)
              });
              console.log("[Agent Enrollment] Added family member:", familyMember.firstName);
            } catch (familyError) {
              console.error("[Agent Enrollment] Error adding family member:", familyError);
            }
          }
        }
      }

      console.log("[Agent Enrollment] Enrollment completed successfully");

      res.json({
        success: true,
        message: "Member enrolled successfully",
        member: {
          id: member.id,
          customerNumber: member.customerNumber,
          memberPublicId: member.memberPublicId,
          email: member.email,
          firstName: member.firstName,
          lastName: member.lastName,
          enrolledByAgent: req.user.agentNumber
        },
        enrollment: {
          planId: planId,
          coverageType: coverageType,
          totalMonthlyPrice: totalMonthlyPrice,
          subscriptionId: subscription?.id
        }
      });

    } catch (error: any) {
      console.error("[Agent Enrollment] Error:", error);
      res.status(500).json({
        error: "Agent enrollment failed",
        message: error.message,
        details: "Internal error"
      });
    }
  });

  // Fix: /api/agent/enrollments (404)
  // NOTE: Specific routes MUST come before dynamic routes like /api/agent/:agentId
  app.get('/api/agent/enrollments', authMiddleware, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role?.trim();
      
      if (!hasAgentOrAdminAccess(userRole)) {
        console.log('[Agent Enrollments] Permission denied:', {
          userRole,
          rawRole: req.user?.role,
          userId: req.user?.id
        });
        return res.status(403).json({ 
          error: 'Agent or admin access required',
          currentRole: userRole
        });
      }

      // Allow admin/super_admin to view any agent's enrollments via query param
      const requestedAgentId = req.query.agentId;
      const isAdminViewingOther = isAdmin(userRole) && requestedAgentId;
      const agentId = isAdminViewingOther ? requestedAgentId : req.user.id;
      const { startDate, endDate } = req.query;
      
      console.log('[Agent Enrollments] Fetching enrollments for:', {
        agentId,
        agentEmail: req.user?.email,
        agentNumber: req.user?.agentNumber,
        role: req.user?.role,
        isAdminViewingOther,
        startDate,
        endDate
      });

      const enrollments = await storage.getEnrollmentsByAgent(
        agentId,
        startDate as string,
        endDate as string
      );
      
      console.log('[Agent Enrollments] Found', enrollments?.length || 0, 'enrollments');
      if (enrollments && enrollments.length > 0) {
        console.log('[Agent Enrollments] Sample enrollment:', {
          id: enrollments[0].id,
          email: enrollments[0].email,
          name: `${enrollments[0].firstName} ${enrollments[0].lastName}`,
          planName: enrollments[0].planName,
          commissionAmount: enrollments[0].commissionAmount,
          enrolledByAgentId: enrollments[0].enrolledByAgentId
        });
      }

      res.json({
        success: true,
        enrollments: enrollments || [],
        total: enrollments?.length || 0,
        agentId: agentId
      });
    } catch (error: any) {
      console.error('Agent enrollments error:', error);
      res.status(500).json({ error: 'Failed to fetch enrollments' });
    }
  });

  // Fix: /api/agent/stats (403) - permission issue
  app.get('/api/agent/stats', authMiddleware, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role?.trim();

      console.log('[Agent Stats] Permission check:', {
        userRole,
        rawRole: req.user?.role,
        isAllowed: hasAgentOrAdminAccess(userRole),
        userId: req.user?.id
      });

      if (!hasAgentOrAdminAccess(userRole)) {
        return res.status(403).json({
          message: 'Agent or admin access required',
          currentRole: userRole,
          allowedRoles: ['agent', 'admin', 'super_admin']
        });
      }

      const requestedAgentId = req.query.agentId;
      const period = typeof req.query.period === 'string' ? req.query.period : undefined;
      const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
      const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
      const isAdminViewingOther = isAdmin(userRole) && requestedAgentId;
      const agentId = isAdminViewingOther ? requestedAgentId : req.user.id;

      const { start: periodStart, end: periodEnd } = getDateRangeFromQuery(period, startDate, endDate);

      console.log('[Agent Stats] Fetching stats for agent:', agentId, {
        isAdminViewingOther,
        period,
        periodStart: periodStart?.toISOString() || null,
        periodEnd: periodEnd?.toISOString() || null
      });

      const enrollments = await storage.getEnrollmentsByAgent(agentId);
      const reportingEnrollments = filterRecordsByDate(enrollments, periodStart, periodEnd);
      const lifetimeTotal = enrollments.length;
      const totalMembers = reportingEnrollments.length;
      const activeMembers = reportingEnrollments.filter((e) => e.isActive || e.status === 'active').length;
      const pendingEnrollments = reportingEnrollments.filter((e) => e.approvalStatus === 'pending' || e.status === 'pending_activation').length;

      const revenueTotal = sumEnrollmentRevenue(reportingEnrollments);

      const now = new Date();
      const endOfTodayDate = endOfDay(now);
      const startOfMonthDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYearDate = new Date(now.getFullYear(), 0, 1);

      const monthlyEnrollmentRecords = filterRecordsByDate(enrollments, startOfMonthDate, endOfTodayDate);
      const yearlyEnrollmentRecords = filterRecordsByDate(enrollments, startOfYearDate, endOfTodayDate);

      const monthlyEnrollments = monthlyEnrollmentRecords.length;
      const yearlyEnrollments = yearlyEnrollmentRecords.length;

      const monthlyRevenue = sumEnrollmentRevenue(monthlyEnrollmentRecords);
      const yearlyRevenue = sumEnrollmentRevenue(yearlyEnrollmentRecords);
      const averageRevenuePerMember = activeMembers > 0 ? revenueTotal / activeMembers : 0;

      const startOfMonthIso = startOfMonthDate.toISOString();
      const startOfYearIso = startOfYearDate.toISOString();
      const todayIso = endOfTodayDate.toISOString();

      const commissionStats = await storage.getCommissionStatsNew(agentId);

      const monthlyCommissions = await storage.getAgentCommissionsNew(agentId, startOfMonthIso, todayIso);
      const yearlyCommissions = await storage.getAgentCommissionsNew(agentId, startOfYearIso, todayIso);

      const monthlyCommissionTotal = parseFloat(sumCommissionAmounts(monthlyCommissions).toFixed(2));
      const yearlyCommissionTotal = parseFloat(sumCommissionAmounts(yearlyCommissions).toFixed(2));
      const performanceGoalData = await storage.resolvePerformanceGoalsForAgent(agentId);

      const responsePayload = {
        success: true,
        totalEnrollments: lifetimeTotal,
        totalMembers,
        activeMembers,
        pendingEnrollments,
        totalRevenue: parseFloat(revenueTotal.toFixed(2)),
        monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
        yearlyRevenue: parseFloat(yearlyRevenue.toFixed(2)),
        averageRevenuePerMember: parseFloat(averageRevenuePerMember.toFixed(2)),
        revenueGrowth: 0,
        memberGrowth: 0,
        commissionGrowth: 0,
        monthlyEnrollments,
        yearlyEnrollments,
        totalCommissions: commissionStats.totalEarned,
        totalCommission: commissionStats.totalEarned,
        monthlyCommissions: monthlyCommissionTotal,
        monthlyCommission: monthlyCommissionTotal,
        yearlyCommissions: yearlyCommissionTotal,
        paidCommissions: commissionStats.totalPaid,
        pendingCommissions: commissionStats.totalPending,
        activeLeads: 0,
        conversionRate: 0,
        leads: [],
        periodStart: periodStart ? periodStart.toISOString() : null,
        periodEnd: periodEnd ? periodEnd.toISOString() : null,
        performanceGoals: performanceGoalData.resolved,
        performanceGoalsMeta: {
          hasOverride: Boolean(performanceGoalData.override),
        },
        ...commissionStats
      };

      console.log('[Agent Stats] Final stats being sent:', responsePayload);
      res.json(responsePayload);
    } catch (error: any) {
      console.error('Agent stats error:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // Fix: /api/agent/commission-stats (404)
  app.get('/api/agent/commission-stats', authMiddleware, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role?.trim();
      const allowedRoles = ['agent', 'admin', 'super_admin'];
      
      console.log("🔍 COMMISSION STATS ROUTE HIT - User:", req.user?.email, "Role:", userRole);

      if (!allowedRoles.includes(userRole)) {
        console.log("❌ Access denied - not agent or admin", { userRole, rawRole: req.user?.role });
        return res.status(403).json({ error: 'Agent or admin access required', currentRole: userRole });
      }

      // Get actual commission stats for the agent
      const agentId = req.user.id;
      const stats = await storage.getCommissionStats(agentId);

      console.log("✅ Got commission stats:", stats);
      
      // Return stats in the format expected by frontend
      res.json(stats);
    } catch (error: any) {
      console.error('❌ Commission stats error:', error);
      res.status(500).json({ error: 'Failed to fetch commission stats', details: error.message });
    }
  });

  // Fix: /api/agent/commissions (403) - permission issue  
  app.get('/api/agent/commissions', authMiddleware, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role?.trim();
      const allowedRoles = ['agent', 'admin', 'super_admin'];
      
      console.log("🔍 AGENT COMMISSIONS ROUTE HIT - User:", req.user?.email, "Role:", userRole);

      if (!allowedRoles.includes(userRole)) {
        console.log("❌ Access denied - not agent or admin", { userRole, rawRole: req.user?.role });
        return res.status(403).json({ error: 'Agent or admin access required', currentRole: userRole });
      }

      const { startDate, endDate } = req.query;
      
      // USE NEW AGENT_COMMISSIONS TABLE (Supabase)
      const commissions = await storage.getAgentCommissionsNew(
        req.user.id,
        startDate as string,
        endDate as string
      );

      console.log("✅ Got", commissions?.length || 0, "commissions for agent:", req.user?.email);
      
      // Return the commissions array directly (already formatted by storage function)
      res.json(commissions || []);
    } catch (error: any) {
      console.error('❌ Agent commissions error:', error);
      res.status(500).json({ error: 'Failed to fetch commissions', details: error.message });
    }
  });

  // Agent: Get commission totals (MTD, YTD, Lifetime)
  app.get('/api/agent/commission-totals', authMiddleware, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role?.trim();
      const allowedRoles = ['agent', 'admin', 'super_admin'];
      
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Agent or admin access required', currentRole: userRole });
      }

      const agentId = req.user.id;
      const totals = await storage.getCommissionTotals(agentId);
      
      res.json(totals);
    } catch (error: any) {
      console.error('Error fetching commission totals:', error);
      res.status(500).json({ error: 'Failed to fetch commission totals', details: error.message });
    }
  });

  // Admin: Get all commission totals with agent breakdown
  app.get('/api/admin/commission-totals', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const totals = await storage.getCommissionTotals(); // No agent ID = get all
      
      res.json(totals);
    } catch (error: any) {
      console.error('Error fetching admin commission totals:', error);
      res.status(500).json({ error: 'Failed to fetch commission totals', details: error.message });
    }
  });

  app.get('/api/admin/performance-goals', authMiddleware, async (req: any, res: any) => {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    try {
      const [defaults, overrides, plans, agents] = await Promise.all([
        storage.getPerformanceGoalDefaults(),
        storage.listAgentPerformanceGoalOverrides(),
        storage.getPlans(),
        storage.getAgents(),
      ]);

      const agentIndex = new Map(
        (Array.isArray(agents) ? agents : []).map((agent: any) => [agent.id, agent])
      );

      const enrichedOverrides = overrides.map((record) => ({
        ...record,
        agent: agentIndex.get(record.agentId) || null,
      }));

      res.json({
        defaults,
        overrides: enrichedOverrides,
        plans,
      });
    } catch (error: any) {
      console.error('[Admin Performance Goals] Failed to load:', error);
      res.status(500).json({ error: 'Failed to load performance goals', message: error.message });
    }
  });

  app.put('/api/admin/performance-goals/defaults', authMiddleware, async (req: any, res: any) => {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    try {
      const goalsPayload = req.body?.goals ?? req.body;
      if (!goalsPayload) {
        return res.status(400).json({ error: 'Goals payload is required' });
      }

      const goals = await storage.updatePerformanceGoalDefaults(goalsPayload, req.user?.id);
      res.json({ success: true, goals });
    } catch (error: any) {
      console.error('[Admin Performance Goals] Failed to update defaults:', error);
      res.status(500).json({ error: 'Failed to update default goals', message: error.message });
    }
  });

  app.put('/api/admin/performance-goals/agent/:agentId', authMiddleware, async (req: any, res: any) => {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { agentId } = req.params;

    try {
      if (!agentId) {
        return res.status(400).json({ error: 'Agent ID is required' });
      }

      const goalsPayload = req.body?.goals ?? req.body;
      if (!goalsPayload) {
        return res.status(400).json({ error: 'Goals payload is required' });
      }

      const goals = await storage.upsertAgentPerformanceGoalOverride(agentId, goalsPayload, req.user?.id);
      res.json({ success: true, agentId, goals });
    } catch (error: any) {
      console.error('[Admin Performance Goals] Failed to update override:', error);
      res.status(500).json({ error: 'Failed to update agent goals', message: error.message });
    }
  });

  app.delete('/api/admin/performance-goals/agent/:agentId', authMiddleware, async (req: any, res: any) => {
    if (!isAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { agentId } = req.params;

    try {
      if (!agentId) {
        return res.status(400).json({ error: 'Agent ID is required' });
      }

      await storage.deleteAgentPerformanceGoalOverride(agentId);
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Admin Performance Goals] Failed to delete override:', error);
      res.status(500).json({ error: 'Failed to delete agent goals', message: error.message });
    }
  });

  // Agent: Export commissions as CSV
  app.get('/api/agent/export-commissions', authMiddleware, async (req: any, res: any) => {
    try {
      const userRole = req.user?.role?.trim();
      
      if (!hasAgentOrAdminAccess(userRole)) {
        return res.status(403).json({ error: 'Agent or admin access required', currentRole: userRole });
      }

      const { startDate, endDate } = req.query;
      
      // Fetch commissions for the agent
      const commissions = await storage.getAgentCommissionsNew(
        req.user.id,
        startDate as string,
        endDate as string
      );

      if (!commissions || commissions.length === 0) {
        // Return empty CSV with headers
        const csv = 'Date,Member,Plan,Type,Commission Amount,Plan Cost,Status,Payment Status\n';
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="commissions-${startDate}-to-${endDate}.csv"`);
        return res.send(csv);
      }

      // Build CSV header
      const csv = [
        'Date,Member,Plan,Type,Commission Amount,Plan Cost,Status,Payment Status',
        ...commissions.map(c => {
          const date = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '';
          const member = c.userName || c.userId || 'Unknown';
          const plan = c.planName || 'Unknown';
          const type = c.planType || 'Unknown';
          const commission = c.commissionAmount?.toFixed(2) || '0.00';
          const cost = c.totalPlanCost?.toFixed(2) || '0.00';
          const status = c.status || 'Unknown';
          const paymentStatus = c.paymentStatus || 'Unknown';
          
          // Escape CSV values that contain commas or quotes
          const escapeCSV = (val: string) => {
            if (val.includes(',') || val.includes('"')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          };
          
          return [
            date,
            escapeCSV(member),
            escapeCSV(plan),
            escapeCSV(type),
            commission,
            cost,
            status,
            paymentStatus
          ].join(',');
        })
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="commissions-${startDate}-to-${endDate}.csv"`);
      res.send(csv);
    } catch (error: any) {
      console.error('Error exporting commissions:', error);
      res.status(500).json({ error: 'Failed to export commissions', details: error.message });
    }
  });

  // Agent lookup endpoint - MUST come AFTER specific /api/agent/* routes
  // Dynamic routes like :agentId catch everything if they come first
  app.get("/api/agent/:agentId", async (req: any, res: any) => {
    try {
      const { agentId } = req.params;
      console.log("[Agent Lookup] Looking up agent:", agentId);

      // Try to find agent by ID or agent number
      let agent;
      try {
        agent = await storage.getUser(agentId);
      } catch (error) {
        // Try by agent number if direct ID lookup fails
        agent = await storage.getUserByAgentNumber(agentId);
      }

      if (!agent) {
        return res.status(404).json({
          error: "Agent not found",
          agentId: agentId
        });
      }

      // Only return agent data if they have enrollment privileges
      if (!hasAgentOrAdminAccess(agent.role)) {
        return res.status(404).json({
          error: "Agent not found",
          agentId: agentId
        });
      }

      res.json({
        success: true,
        agent: {
          id: agent.id,
          agentNumber: agent.agentNumber,
          firstName: agent.firstName,
          lastName: agent.lastName,
          email: agent.email,
          isActive: agent.isActive,
          role: agent.role
        }
      });

    } catch (error: any) {
      console.error("[Agent Lookup] Error:", error);
      res.status(500).json({
        error: "Agent lookup failed",
        details: "Internal error"
      });
    }
  });

  // Fix: Missing admin endpoints for user management tabs
  app.get('/api/admin/pending-users', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const users = await storage.getAllUsers();
      const pendingUsers = users.users?.filter((user: any) => user.approvalStatus === 'pending') || [];
      res.json(pendingUsers);
    } catch (error: any) {
      console.error('Error fetching pending users:', error);
      res.status(500).json({ error: 'Failed to fetch pending users' });
    }
  });

  // Admin: Get all commissions
  // Admin: Get all commissions (admin/super_admin can see ALL, agents see only their own via /api/agent/commissions)
  app.get('/api/admin/commissions', authMiddleware, async (req: any, res: any) => {
    try {
      console.log('[Admin Commissions] Request from user:', req.user?.email, 'Role:', req.user?.role);
      
      // Only admins and super_admins can access this endpoint to see ALL commissions
      const hasAdminPrivileges = isAdmin(req.user?.role);
      
      if (!hasAdminPrivileges) {
        console.error('[Admin Commissions] Access denied - user role:', req.user?.role);
        return res.status(403).json({ 
          error: 'Admin access required',
          userRole: req.user?.role,
          message: 'Only admin or super_admin can view all commissions. Agents should use /api/agent/commissions'
        });
      }

      const { startDate, endDate } = req.query;
      console.log('[Admin Commissions] Fetching ALL commissions with date filter:', { startDate, endDate });
      
      const commissions = await storage.getAllCommissionsNew(
        startDate as string,
        endDate as string
      );
      
      console.log('[Admin Commissions] Successfully fetched', commissions?.length || 0, 'total commissions');
      res.json(commissions);
    } catch (error: any) {
      console.error('[Admin Commissions] Error:', error);
      res.status(500).json({ error: 'Failed to fetch commissions', details: error.message });
    }
  });

  // Admin: Mark commissions as paid
  app.post('/api/admin/mark-commissions-paid', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { commissionIds, paymentDate } = req.body;

      console.log('[Route] mark-commissions-paid request:', {
        commissionIds,
        paymentDate,
        idsCount: commissionIds?.length,
        userRole: req.user?.role
      });

      if (!Array.isArray(commissionIds) || commissionIds.length === 0) {
        return res.status(400).json({ error: 'Commission IDs are required' });
      }

      await storage.markCommissionsAsPaid(commissionIds, paymentDate);
      
      res.json({ success: true, message: `${commissionIds.length} commission(s) marked as paid` });
    } catch (error: any) {
      console.error('[Route] Error marking commissions as paid:', error);
      res.status(500).json({ 
        error: 'Failed to mark commissions as paid',
        message: error.message,
        details: error.toString()
      });
    }
  });

  // Admin: Update single commission payout
  app.post('/api/admin/commission/:commissionId/payout', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { commissionId } = req.params;
      const { paymentStatus, paymentDate, notes } = req.body;

      if (!paymentStatus) {
        return res.status(400).json({ error: 'Payment status is required' });
      }

      if (!['paid', 'pending', 'unpaid'].includes(paymentStatus)) {
        return res.status(400).json({ error: 'Invalid payment status' });
      }

      const result = await storage.updateCommissionPayoutStatus(commissionId, {
        paymentStatus,
        paymentDate,
        notes
      });

      res.json({ success: true, commission: result });
    } catch (error: any) {
      console.error('Error updating commission payout:', error);
      res.status(500).json({ error: 'Failed to update commission payout', details: error.message });
    }
  });

  // Admin: Batch update commission payouts
  app.post('/api/admin/commissions/batch-payout', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { updates } = req.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'Updates array is required' });
      }

      // Validate updates
      for (const update of updates) {
        if (!update.commissionId || !update.paymentStatus) {
          return res.status(400).json({ error: 'Each update must have commissionId and paymentStatus' });
        }
        if (!['paid', 'pending', 'unpaid'].includes(update.paymentStatus)) {
          return res.status(400).json({ error: `Invalid payment status: ${update.paymentStatus}` });
        }
      }

      await storage.updateMultipleCommissionPayouts(updates);

      res.json({ success: true, message: `${updates.length} commission(s) payout updated` });
    } catch (error: any) {
      console.error('Error batch updating commissions:', error);
      res.status(500).json({ error: 'Failed to batch update commissions', details: error.message });
    }
  });

  // Admin: Get commissions for payout management
  app.get('/api/admin/commissions/payout-list', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { agentId, paymentStatus, minAmount } = req.query;

      const commissions = await storage.getCommissionsForPayout(
        agentId as string,
        paymentStatus as string,
        minAmount ? parseFloat(minAmount as string) : undefined
      );

      res.json(commissions);
    } catch (error: any) {
      console.error('Error fetching commissions for payout:', error);
      res.status(500).json({ error: 'Failed to fetch commissions for payout', details: error.message });
    }
  });

  // Admin: Get agent hierarchy
  app.get('/api/admin/agents/hierarchy', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const agents = await storage.getAgentHierarchy();
      res.json(agents);
    } catch (error: any) {
      console.error('Error fetching agent hierarchy:', error);
      res.status(500).json({ error: 'Failed to fetch agent hierarchy' });
    }
  });

  // Admin: Update agent hierarchy
  app.post('/api/admin/agents/update-hierarchy', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { agentId, uplineId, overrideAmount, reason } = req.body;

      if (!agentId) {
        return res.status(400).json({ error: 'Agent ID is required' });
      }

      await storage.updateAgentHierarchy(
        agentId,
        uplineId,
        overrideAmount,
        req.user.id,
        reason
      );

      res.json({ success: true, message: 'Agent hierarchy updated successfully' });
    } catch (error: any) {
      console.error('Error updating agent hierarchy:', error);
      res.status(500).json({ error: 'Failed to update agent hierarchy' });
    }
  });

  app.get('/api/admin/login-sessions', authMiddleware, async (req: any, res: any) => {
    try {
      console.log("🔍 LOGIN SESSIONS ROUTE HIT");
      console.log("User:", req.user?.email);
      console.log("Role:", req.user?.role);

      if (!isAdmin(req.user?.role)) {
        console.log("❌ Access denied - not admin");
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { limit = "50" } = req.query;
      const loginSessions = await storage.getAllLoginSessions(parseInt(limit as string));
      console.log("✅ Got", loginSessions?.length || 0, "login sessions");
      res.json(loginSessions);
    } catch (error: any) {
      console.error("❌ Error fetching login sessions:", error);
      res.status(500).json({ error: 'Failed to fetch login sessions' });
    }
  });

  app.put('/api/admin/users/:userId/role', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const { role } = req.body;

      // Users table should ONLY contain 'admin' and 'agent' roles
      // 'member' is NOT a user role - members are enrolled customers in separate members table
      if (!["agent", "admin"].includes(role)) {
        return res.status(400).json({
          error: "Invalid role. Must be 'agent' or 'admin'. Note: 'member' is not a valid user role - members are enrolled customers in the members table."
        });
      }

      const updatedUser = await storage.updateUser(userId, {
        role,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role" });
    }
  });

  app.put('/api/admin/users/:userId/agent-number', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const { agentNumber } = req.body;

      // Get user to validate they can have an agent number
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Only agents, admins, or super admins should have agent numbers
      if (!hasAgentOrAdminAccess(user.role)) {
        return res.status(400).json({
          error: 'Only agents and admins can be assigned agent numbers'
        });
      }

      // Check for duplicate agent numbers if provided
      if (agentNumber && agentNumber.trim() !== '') {
        const existingUser = await storage.getUserByAgentNumber(agentNumber.trim());
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({
            error: 'Agent number already in use'
          });
        }
      }

      const result = await storage.updateUser(userId, {
        agentNumber: agentNumber?.trim() || null,
        updatedAt: new Date(),
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error updating agent number:", error);
      res.status(500).json({ error: "Failed to update agent number" });
    }
  });

  app.put('/api/admin/users/:userId', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const { firstName, lastName, email, phone } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email) {
        return res.status(400).json({ 
          error: 'First name, last name, and email are required' 
        });
      }

      // Check if user exists
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If email is changing, check for duplicates
      if (email !== existingUser.email) {
        const duplicateUser = await storage.getUserByEmail(email);
        if (duplicateUser && duplicateUser.id !== userId) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }

      // Update user in database
      const updatedUser = await storage.updateUser(userId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        updatedAt: new Date(),
      });

      // If email changed, update Supabase Auth email
      if (email !== existingUser.email) {
        try {
          const { data, error } = await supabase.auth.admin.updateUserById(
            userId,
            { email: email.trim().toLowerCase() }
          );
          
          if (error) {
            console.error('[Admin Update User] Failed to update Supabase Auth email:', error);
            // Continue anyway - database is updated
          }
        } catch (authError: any) {
          console.error('[Admin Update User] Error updating Supabase Auth:', authError);
          // Continue anyway - database is updated
        }
      }

      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.put('/api/admin/users/:userId/suspend', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const { reason } = req.body;

      const updatedUser = await storage.updateUser(userId, {
        isActive: false,
        approvalStatus: 'suspended',
        rejectionReason: reason || 'Account suspended by administrator',
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error suspending user:", error);
      res.status(500).json({ error: "Failed to suspend user" });
    }
  });

  app.put('/api/admin/users/:userId/reactivate', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;

      const updatedUser = await storage.updateUser(userId, {
        isActive: true,
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: req.user.id,
        rejectionReason: null,
        updatedAt: new Date(),
      });

      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error reactivating user:", error);
      res.status(500).json({ error: "Failed to reactivate user" });
    }
  });

  app.post('/api/admin/approve-user/:userId', authMiddleware, async (req: any, res: any) => {
    try {
      if (!isAdmin(req.user?.role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { userId } = req.params;
      const updatedUser = await storage.updateUser(userId, {
        approvalStatus: 'approved',
        approvedAt: new Date(),
        approvedBy: req.user.id,
        updatedAt: new Date(),
      });
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Error approving user:", error);
      res.status(500).json({ error: "Failed to approve user" });
    }
  });

  // Fix: /api/user (404) - basic user endpoint
  app.get('/api/user', authenticateToken, async (req: AuthRequest, res: any) => {
    try {
      // Return authenticated user from token
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Get user details from database
      const user = await storage.getUserByEmail(req.user.email);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        agentNumber: user.agentNumber || null
      });
    } catch (error: any) {
      console.error('[/api/user] Error:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // Send confirmation email endpoint
  app.post('/api/send-confirmation-email', async (req: any, res: any) => {
    try {
      const { email, customerNumber, memberName, planName, transactionId, amount } = req.body || {};

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const normalizedAmount = (() => {
        if (typeof amount === 'number') {
          return Number.isFinite(amount) ? amount : undefined;
        }
        if (typeof amount === 'string') {
          const parsed = parseFloat(amount);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
      })();

      await sendManualConfirmationEmail({
        recipientEmail: email,
        memberName: memberName || 'My Premier Plans Member',
        customerNumber,
        planName,
        transactionId,
        amount: normalizedAmount
      });

      res.json({
        success: true,
        message: 'Confirmation email sent successfully'
      });
    } catch (error: any) {
      console.error('[Email] Error sending confirmation:', error);
      res.status(500).json({ error: 'Failed to send confirmation email' });
    }
  });

  /**
   * GET /api/payments/by-transaction/:transactionId
   * Public endpoint to fetch payment and member details by transaction ID
   * Used by confirmation page after EPX redirect
   */
  router.get('/api/payments/by-transaction/:transactionId', async (req, res) => {
    try {
      const { transactionId } = req.params;
      
      if (!transactionId) {
        return res.status(400).json({ success: false, error: 'Transaction ID required' });
      }

      const payment = await storage.getPaymentByTransactionId(transactionId);
      
      if (!payment) {
        return res.status(404).json({ success: false, error: 'Payment not found' });
      }

      let member = null;
      if (payment.member_id) {
        try {
          member = await storage.getMember(payment.member_id);
        } catch (memberError) {
          console.warn('[Payments] Could not fetch member for payment', { transactionId, memberId: payment.member_id });
        }
      }

      res.json({
        success: true,
        payment: {
          id: payment.id,
          transactionId: payment.transaction_id,
          amount: payment.amount,
          status: payment.status,
          createdAt: payment.created_at
        },
        member: member ? {
          id: member.id,
          customerNumber: member.customerNumber || member.customer_number,
          memberPublicId: member.memberPublicId || member.member_public_id,
          firstName: member.firstName || member.first_name,
          lastName: member.lastName || member.last_name,
          email: member.email,
          status: member.status
        } : null
      });
    } catch (error: any) {
      console.error('[Payments] Error fetching payment by transaction ID:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch payment details' });
    }
  });

  // Log the new routes
  console.log("[Route] POST /api/registration");
  console.log("[Route] POST /api/agent/enrollment");
  console.log("[Route] GET /api/agent/:agentId");
  console.log("[Route] GET /api/agent/enrollments");
  console.log("[Route] GET /api/agent/stats"); 
  console.log("[Route] GET /api/agent/commission-stats");
  console.log("[Route] GET /api/agent/commissions");
  console.log("[Route] GET /api/user");
  console.log("[Route] POST /api/send-confirmation-email");
  console.log("[Route] GET /api/payments/by-transaction/:transactionId");

  // Return the app with routes registered
  return app;
}
