// Test endpoint for new commission system
// Add this to your routes.ts file temporarily for testing

// TEST ENDPOINT: Create a sample commission to verify new system works
router.post("/api/test-commission", async (req, res) => {
  try {
    const { createCommissionDualWrite } = await import('./commission-service.js');
    
    console.log('[Test Commission] Creating test commission...');
    
    // Create a test commission
    const testCommission = {
      agent_id: 'test-agent-' + Date.now(),
      member_id: 'test-member-' + Date.now(),
      commission_amount: 125.50,
      coverage_type: 'aca',
      status: 'pending',
      payment_status: 'unpaid',
      notes: 'Test commission from API endpoint - ' + new Date().toISOString()
    };

    console.log('[Test Commission] Commission data:', testCommission);

    const result = await createCommissionDualWrite(testCommission);
    
    if (result.success) {
      console.log('[Test Commission] ✅ SUCCESS:', result);
      res.json({
        success: true,
        message: 'NEW COMMISSION SYSTEM WORKING!',
        commission: result,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('[Test Commission] ❌ FAILED:', result.error);
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Commission creation failed'
      });
    }
  } catch (error) {
    console.error('[Test Commission] 💥 CRASHED:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Test commission endpoint crashed'
    });
  }
});

// TEST ENDPOINT: Check if commissions exist in new table
router.get("/api/test-commission-count", async (req, res) => {
  try {
    const { supabase } = await import('./lib/supabaseClient.js');
    
    console.log('[Test Count] Checking agent_commissions table...');
    
    const { data, error, count } = await supabase
      .from('agent_commissions')
      .select('*', { count: 'exact' });

    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }

    console.log('[Test Count] ✅ Query successful:', { count, recordCount: data?.length });
    
    res.json({
      success: true,
      message: `Found ${count} commissions in new table`,
      count: count,
      records: data?.length || 0,
      sampleRecord: data?.[0] || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Test Count] ❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to count commissions'
    });
  }
});