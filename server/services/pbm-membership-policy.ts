import { RX_ADDON_MONTHLY_PRICE } from "@shared/pricing";
import { calculateNextBillingCycleDate } from "../utils/membership-dates";

export const PBM_MONTHLY_PRICE = RX_ADDON_MONTHLY_PRICE;

export function calculatePbmAmount(currentAmount: number, amountDelta: number): number {
  return Number((Number(currentAmount) + Number(amountDelta)).toFixed(2));
}

export function getPbmAmountDelta(currentEnabled: boolean, targetEnabled: boolean): number {
  return targetEnabled === currentEnabled ? 0 : targetEnabled ? PBM_MONTHLY_PRICE : -PBM_MONTHLY_PRICE;
}

export function isPbmChangeEffective(effectiveDate: string, billingDate: string): boolean {
  return effectiveDate <= billingDate;
}

export function getPbmEffectiveDate(input: {
  nextBillingDate: string;
  businessDate: string;
  billingAnchorDay: number;
  currentCycleStarted: boolean;
}): string {
  const cycleStarted = input.currentCycleStarted || input.nextBillingDate <= input.businessDate;
  return cycleStarted
    ? calculateNextBillingCycleDate(input.nextBillingDate, input.billingAnchorDay)
    : input.nextBillingDate;
}

export function resolvePbmRequestError(input: {
  inScope: boolean;
  memberActive: boolean;
  subscriptionActive: boolean;
  currentEnabled: boolean;
  targetEnabled: boolean;
  hasPendingChange: boolean;
}): { status: number; message: string } | null {
  if (!input.inScope) return { status: 403, message: "Access denied to this member" };
  if (!input.memberActive || !input.subscriptionActive) {
    return { status: 409, message: "PBM servicing requires an active DPC membership" };
  }
  if (input.hasPendingChange) return { status: 409, message: "A PBM change is already pending" };
  if (input.currentEnabled === input.targetEnabled) {
    return { status: 409, message: "PBM is already in the requested state" };
  }
  return null;
}

export function getPbmCycleAmount(baseAmount: number, amountDelta: number, effective: boolean): number {
  return effective ? calculatePbmAmount(baseAmount, amountDelta) : Number(Number(baseAmount).toFixed(2));
}

export function shouldApplyPbmChangeAfterBilling(outcome: string): boolean {
  return outcome === "completed";
}

export function canWithdrawPbmChange(fulfillmentStatus: string, billingCycleStarted = false): boolean {
  return fulfillmentStatus === "Pending Submission" && !billingCycleStarted;
}
