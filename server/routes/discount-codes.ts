import { Router } from "express";
import { db } from "../db";
import type { AuthRequest } from "../auth/supabaseAuth";
import { authenticateToken } from "../auth/supabaseAuth";
import { hasAtLeastRole } from "../auth/roles";
import type { Request } from "express";

const router = Router();

// ============================================================
// PUBLIC ENDPOINTS (No authentication required)
// ============================================================

// Validate discount code (public endpoint for registration)
router.get("/api/discount-codes/validate", async (req: Request, res) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ 
        isValid: false, 
        message: "Discount code is required" 
      });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Query discount code from database
    const result = await db.query(
      `SELECT 
        id, 
        code, 
        description,
        discount_type as "discountType",
        discount_value as "discountValue",
        duration_type as "durationType",
        duration_months as "durationMonths",
        is_active as "isActive",
        max_uses as "maxUses",
        current_uses as "currentUses",
        valid_from as "validFrom",
        valid_until as "validUntil"
      FROM discount_codes 
      WHERE code = $1 AND is_active = true`,
      [normalizedCode]
    );

    if (result.rows.length === 0) {
      return res.json({ 
        isValid: false, 
        message: "Invalid or inactive discount code" 
      });
    }

    const discountCode = result.rows[0];

    // Check if code has expired
    const now = new Date();
    if (discountCode.validFrom && new Date(discountCode.validFrom) > now) {
      return res.json({ 
        isValid: false, 
        message: "This discount code is not yet active" 
      });
    }

    if (discountCode.validUntil && new Date(discountCode.validUntil) < now) {
      return res.json({ 
        isValid: false, 
        message: "This discount code has expired" 
      });
    }

    // Check max uses
    if (discountCode.maxUses && discountCode.currentUses >= discountCode.maxUses) {
      return res.json({ 
        isValid: false, 
        message: "This discount code has reached its maximum number of uses" 
      });
    }

    // Calculate discount amount (for display purposes)
    let discountAmount = discountCode.discountValue;
    if (discountCode.discountType === 'percentage') {
      // For percentage, we'll need the plan price, but for now just return the percentage
      discountAmount = discountCode.discountValue;
    }

    return res.json({
      isValid: true,
      discountAmount: discountCode.discountType === 'fixed' ? discountAmount : null,
      discountPercentage: discountCode.discountType === 'percentage' ? discountAmount : null,
      discountType: discountCode.discountType,
      durationType: discountCode.durationType,
      durationMonths: discountCode.durationMonths,
      message: `Discount code applied: ${discountCode.description}`,
    });

  } catch (error: any) {
    console.error("[Validate Discount Code] Error:", error);
    return res.status(500).json({ 
      isValid: false, 
      message: "Failed to validate discount code",
      error: error.message 
    });
  }
});

// ============================================================
// ADMIN ENDPOINTS (Authentication required)
// ============================================================

// Get all discount codes (admin and super_admin)
router.get("/api/admin/discount-codes", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    
    if (!hasAtLeastRole(userRole, 'admin')) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    console.log('[Get Discount Codes] Request from:', req.user?.email, 'Role:', userRole);

    const result = await db.query(
      `SELECT 
        id, 
        code, 
        description,
        discount_type as "discountType",
        discount_value as "discountValue",
        duration_type as "durationType",
        duration_months as "durationMonths",
        is_active as "isActive",
        max_uses as "maxUses",
        current_uses as "currentUses",
        valid_from as "validFrom",
        valid_until as "validUntil",
        created_at as "createdAt",
        created_by as "createdBy"
      FROM discount_codes 
      ORDER BY created_at DESC`
    );

    return res.json(result.rows);

  } catch (error: any) {
    console.error("[Get Discount Codes] Error:", error);
    return res.status(500).json({ 
      message: "Failed to fetch discount codes",
      error: error.message 
    });
  }
});

// Create discount code (admin or super_admin)
router.post("/api/admin/discount-codes", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    
    if (!hasAtLeastRole(userRole, 'admin')) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const {
      code,
      description,
      discountType,
      discountValue,
      durationType,
      durationMonths,
      maxUses,
      validFrom,
      validUntil,
    } = req.body;

    // Validate required fields
    if (!code || !description || !discountType || !discountValue || !durationType) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Check if code already exists
    const existing = await db.query(
      "SELECT id FROM discount_codes WHERE code = $1",
      [normalizedCode]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Discount code already exists" });
    }

    // Insert new discount code
    const result = await db.query(
      `INSERT INTO discount_codes (
        code, 
        description, 
        discount_type, 
        discount_value, 
        duration_type, 
        duration_months,
        max_uses,
        valid_from,
        valid_until,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING 
        id, 
        code, 
        description,
        discount_type as "discountType",
        discount_value as "discountValue",
        duration_type as "durationType",
        duration_months as "durationMonths",
        is_active as "isActive",
        max_uses as "maxUses",
        current_uses as "currentUses",
        valid_from as "validFrom",
        valid_until as "validUntil",
        created_at as "createdAt",
        created_by as "createdBy"`,
      [
        normalizedCode,
        description,
        discountType,
        discountValue,
        durationType,
        durationMonths,
        maxUses,
        validFrom,
        validUntil,
        req.user?.id
      ]
    );

    return res.status(201).json(result.rows[0]);

  } catch (error: any) {
    console.error("[Create Discount Code] Error:", error);
    return res.status(500).json({ 
      message: "Failed to create discount code",
      error: error.message 
    });
  }
});

// Update discount code (admin or super_admin)
router.put("/api/admin/discount-codes/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    
    if (!hasAtLeastRole(userRole, 'admin')) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const { id } = req.params;
    const {
      code,
      description,
      discountType,
      discountValue,
      durationType,
      durationMonths,
      maxUses,
      validFrom,
      validUntil,
    } = req.body;

    const normalizedCode = code.trim().toUpperCase();

    // Check if code exists with different ID
    const existing = await db.query(
      "SELECT id FROM discount_codes WHERE code = $1 AND id != $2",
      [normalizedCode, id]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ message: "Discount code already exists" });
    }

    // Update discount code
    const result = await db.query(
      `UPDATE discount_codes SET
        code = $1,
        description = $2,
        discount_type = $3,
        discount_value = $4,
        duration_type = $5,
        duration_months = $6,
        max_uses = $7,
        valid_from = $8,
        valid_until = $9
      WHERE id = $10
      RETURNING 
        id, 
        code, 
        description,
        discount_type as "discountType",
        discount_value as "discountValue",
        duration_type as "durationType",
        duration_months as "durationMonths",
        is_active as "isActive",
        max_uses as "maxUses",
        current_uses as "currentUses",
        valid_from as "validFrom",
        valid_until as "validUntil",
        created_at as "createdAt",
        created_by as "createdBy"`,
      [
        normalizedCode,
        description,
        discountType,
        discountValue,
        durationType,
        durationMonths,
        maxUses,
        validFrom,
        validUntil,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Discount code not found" });
    }

    return res.json(result.rows[0]);

  } catch (error: any) {
    console.error("[Update Discount Code] Error:", error);
    return res.status(500).json({ 
      message: "Failed to update discount code",
      error: error.message 
    });
  }
});

// Toggle discount code active status (admin or super_admin)
router.patch("/api/admin/discount-codes/:id/toggle", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    
    if (!hasAtLeastRole(userRole, 'admin')) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const { id } = req.params;
    const { isActive } = req.body;

    const result = await db.query(
      `UPDATE discount_codes SET is_active = $1 WHERE id = $2
      RETURNING 
        id, 
        code, 
        description,
        discount_type as "discountType",
        discount_value as "discountValue",
        duration_type as "durationType",
        duration_months as "durationMonths",
        is_active as "isActive",
        max_uses as "maxUses",
        current_uses as "currentUses",
        valid_from as "validFrom",
        valid_until as "validUntil",
        created_at as "createdAt",
        created_by as "createdBy"`,
      [isActive, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Discount code not found" });
    }

    return res.json(result.rows[0]);

  } catch (error: any) {
    console.error("[Toggle Discount Code] Error:", error);
    return res.status(500).json({ 
      message: "Failed to toggle discount code status",
      error: error.message 
    });
  }
});

// Delete discount code (admin or super_admin)
router.delete("/api/admin/discount-codes/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    
    if (!hasAtLeastRole(userRole, 'admin')) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const { id } = req.params;

    // Check if code is in use
    const usageCheck = await db.query(
      "SELECT COUNT(*) as count FROM member_discount_codes WHERE discount_code_id = $1",
      [id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        message: "Cannot delete discount code that has been used. Deactivate it instead." 
      });
    }

    const result = await db.query(
      "DELETE FROM discount_codes WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Discount code not found" });
    }

    return res.json({ message: "Discount code deleted successfully" });

  } catch (error: any) {
    console.error("[Delete Discount Code] Error:", error);
    return res.status(500).json({ 
      message: "Failed to delete discount code",
      error: error.message 
    });
  }
});

export default router;
