import { Router } from "express";
import type { Request } from "express";
import type { AuthRequest } from "../auth/supabaseAuth";
import { authenticateToken } from "../auth/supabaseAuth";
import { isAtLeastAdmin } from "../auth/roles";
import type { DiscountCodeInput } from "../storage";
import {
  createDiscountCode,
  deleteDiscountCode,
  getAllDiscountCodes,
  getDiscountCodeByCode,
  getDiscountCodeUsageCount,
  toggleDiscountCodeActive,
  updateDiscountCode,
} from "../storage";

const router = Router();

const VALID_DISCOUNT_TYPES: DiscountCodeInput['discountType'][] = ['fixed', 'percentage'];
const VALID_DURATION_TYPES: DiscountCodeInput['durationType'][] = ['once', 'limited_months', 'indefinite'];

const normalizeDateInput = (value?: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const parsePositiveNumberOrNull = (value: any): number | null => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const buildDiscountInputFromBody = (body: any): DiscountCodeInput => {
  const code = (body.code ?? '').toString().trim().toUpperCase();
  const description = (body.description ?? '').toString().trim();
  const discountType = (body.discountType ?? '').toString().toLowerCase();
  const durationType = (body.durationType ?? '').toString().toLowerCase();
  const discountValue = Number(body.discountValue);

  if (!code || !description || !discountType || !durationType) {
    throw new Error("Missing required fields");
  }

  if (!VALID_DISCOUNT_TYPES.includes(discountType as DiscountCodeInput['discountType'])) {
    throw new Error("Invalid discount type");
  }

  if (!VALID_DURATION_TYPES.includes(durationType as DiscountCodeInput['durationType'])) {
    throw new Error("Invalid duration type");
  }

  if (Number.isNaN(discountValue) || discountValue <= 0) {
    throw new Error("Discount value must be a positive number");
  }

  const durationMonths = durationType === 'limited_months'
    ? parsePositiveNumberOrNull(body.durationMonths)
    : null;

  if (durationType === 'limited_months' && !durationMonths) {
    throw new Error("Duration months are required for limited duration discounts");
  }

  return {
    code,
    description,
    discountType: discountType as DiscountCodeInput['discountType'],
    discountValue,
    durationType: durationType as DiscountCodeInput['durationType'],
    durationMonths,
    maxUses: parsePositiveNumberOrNull(body.maxUses),
    validFrom: normalizeDateInput(body.validFrom),
    validUntil: normalizeDateInput(body.validUntil),
  } as DiscountCodeInput;
};

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
    const discountCode = await getDiscountCodeByCode(normalizedCode);

    if (!discountCode || !discountCode.isActive) {
      return res.json({ 
        isValid: false, 
        message: "Invalid or inactive discount code" 
      });
    }

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
    const discountAmount = discountCode.discountValue;

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
    
    if (!isAtLeastAdmin(userRole)) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    console.log('[Get Discount Codes] Request from:', req.user?.email, 'Role:', userRole);

    const codes = await getAllDiscountCodes();

    return res.json(codes);

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
    
    if (!isAtLeastAdmin(userRole)) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    let payload: DiscountCodeInput;
    try {
      payload = buildDiscountInputFromBody(req.body);
    } catch (validationError: any) {
      return res.status(400).json({ message: validationError.message || "Invalid discount code payload" });
    }

    const existing = await getDiscountCodeByCode(payload.code);
    if (existing) {
      return res.status(400).json({ message: "Discount code already exists" });
    }

    const created = await createDiscountCode(payload, { createdBy: req.user?.id ?? null });

    return res.status(201).json(created);

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
    
    if (!isAtLeastAdmin(userRole)) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const { id } = req.params;

    let payload: DiscountCodeInput;
    try {
      payload = buildDiscountInputFromBody(req.body);
    } catch (validationError: any) {
      return res.status(400).json({ message: validationError.message || "Invalid discount code payload" });
    }

    const existing = await getDiscountCodeByCode(payload.code);
    if (existing && existing.id !== id) {
      return res.status(400).json({ message: "Discount code already exists" });
    }

    const updated = await updateDiscountCode(id, payload);

    return res.json(updated);

  } catch (error: any) {
    console.error("[Update Discount Code] Error:", error);
    const status = error?.message === "Discount code not found" ? 404 : 500;
    return res.status(status).json({ 
      message: status === 404 ? error.message : "Failed to update discount code",
      error: error.message 
    });
  }
});

// Toggle discount code active status (admin or super_admin)
router.patch("/api/admin/discount-codes/:id/toggle", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    
    if (!isAtLeastAdmin(userRole)) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const { id } = req.params;
    const { isActive } = req.body;

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: "isActive boolean is required" });
    }

    const updated = await toggleDiscountCodeActive(id, isActive);

    return res.json(updated);

  } catch (error: any) {
    console.error("[Toggle Discount Code] Error:", error);
    const status = error?.message === "Discount code not found" ? 404 : 500;
    return res.status(status).json({ 
      message: status === 404 ? error.message : "Failed to toggle discount code status",
      error: error.message 
    });
  }
});

// Delete discount code (admin or super_admin)
router.delete("/api/admin/discount-codes/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user?.role;
    
    if (!isAtLeastAdmin(userRole)) {
      return res.status(403).json({ message: "Unauthorized: Admin access required" });
    }

    const { id } = req.params;

    const usageCount = await getDiscountCodeUsageCount(id);

    if (usageCount > 0) {
      return res.status(400).json({ 
        message: "Cannot delete discount code that has been used. Deactivate it instead." 
      });
    }

    await deleteDiscountCode(id);

    return res.json({ message: "Discount code deleted successfully" });

  } catch (error: any) {
    console.error("[Delete Discount Code] Error:", error);
    const status = error?.message === "Discount code not found" ? 404 : 500;
    return res.status(status).json({ 
      message: status === 404 ? error.message : "Failed to delete discount code",
      error: error.message 
    });
  }
});

export default router;
