import { supabase } from "../lib/supabaseClient";
import { formatDateForEPX } from "../utils/membership-dates";
import { getEPXService, EPXCreateSubscriptionRequest } from "./epx-payment-service";
import { logEPX } from "./epx-payment-logger";

interface MemberRecord {
  id: number;
  first_name?: string;
  last_name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string | null;
  customer_number?: string | null;
  customerNumber?: string | null;
  payment_token?: string | null;
  paymentToken?: string | null;
  payment_method_type?: string | null;
  paymentMethodType?: string | null;
  first_payment_date?: string | null;
  firstPaymentDate?: string | null;
  total_monthly_price?: string | number | null;
  totalMonthlyPrice?: string | number | null;
}

interface CreateRecurringSubscriptionOptions {
  member: MemberRecord;
  subscriptionId: number;
  amount?: number | string | null;
  billingDate?: Date | string | null;
  paymentToken?: string | null;
  paymentMethodType?: string | null;
  source?: string;
}

export interface CreateRecurringSubscriptionResult {
  success: boolean;
  epxSubscriptionId?: string;
  error?: string;
  response?: any;
}

const DEFAULT_RETRIES = 3;
const RECURRING_ENABLED = (process.env.EPX_RECURRING_ENABLED || 'false').toLowerCase() === 'true';

function getMemberValue(member: MemberRecord, primary: keyof MemberRecord, secondary: keyof MemberRecord, fallback?: any) {
  if (member[primary] !== undefined && member[primary] !== null) return member[primary];
  if (member[secondary] !== undefined && member[secondary] !== null) return member[secondary];
  return fallback;
}

export async function createRecurringSubscription(
  options: CreateRecurringSubscriptionOptions
): Promise<CreateRecurringSubscriptionResult> {
  if (!RECURRING_ENABLED) {
    logEPX({
      level: "info",
      phase: "recurring",
      message: "Recurring billing disabled via EPX_RECURRING_ENABLED; skipping subscription creation",
      data: { subscriptionId: options.subscriptionId },
    });
    return {
      success: false,
      error: "Recurring billing disabled",
    };
  }
  const member = options.member;
  const firstName = getMemberValue(member, "firstName", "first_name", "Member");
  const lastName = getMemberValue(member, "lastName", "last_name", "");
  const email = member.email;
  const phone = member.phone || "0000000000";
  const customerNumber =
    getMemberValue(member, "customerNumber", "customer_number", null) || `MEM-${member.id}`;
  const paymentToken =
    options.paymentToken || getMemberValue(member, "paymentToken", "payment_token") || undefined;
  const paymentMethodType =
    (options.paymentMethodType || getMemberValue(member, "paymentMethodType", "payment_method_type") || "CreditCard") as
      | "CreditCard"
      | "BankAccount"
      | string;

  if (!paymentToken) {
    return {
      success: false,
      error: "Missing payment token for member",
    };
  }

  if (!email) {
    return {
      success: false,
      error: "Missing member email address",
    };
  }

  const amountSource =
    options.amount ??
    getMemberValue(member, "totalMonthlyPrice", "total_monthly_price") ??
    null;

  const normalizedAmount = typeof amountSource === "string" ? parseFloat(amountSource) : Number(amountSource);

  if (!normalizedAmount || Number.isNaN(normalizedAmount)) {
    return {
      success: false,
      error: "Invalid or missing subscription amount",
    };
  }

  const billingDateInput =
    options.billingDate ||
    getMemberValue(member, "firstPaymentDate", "first_payment_date") ||
    new Date();

  const billingDate = billingDateInput instanceof Date ? billingDateInput : new Date(billingDateInput);
  const formattedBillingDate = formatDateForEPX(billingDate);

  const payload: EPXCreateSubscriptionRequest = {
    MerchantAccountCode: process.env.EPX_MERCHANT_ACCOUNT_CODE || "DPCPRIMARY",
    Payment: {
      PaymentMethodType: "PreviousPayment",
      PreviousPayment: {
        GUID: paymentToken,
        Amount: normalizedAmount,
        PaymentType: paymentMethodType === "BankAccount" ? "BankAccount" : "CreditCard",
      },
    },
    BillingSchedule: {
      Frequency: "Monthly",
      StartDate: formattedBillingDate,
      FailureOption: "Skip",
      RetryAttempts: DEFAULT_RETRIES,
    },
    SubscriptionName: `DPC - ${customerNumber}`,
    CustomerEmail: email,
    CustomerName: `${firstName} ${lastName}`.trim(),
    CustomerAccountCode: customerNumber,
    CustomerPhone: phone,
  };

  logEPX({
    level: "info",
    phase: "recurring",
    message: "Submitting EPX create subscription request",
    data: {
      subscriptionId: options.subscriptionId,
      memberId: member.id,
      amount: normalizedAmount,
      billingDate: formattedBillingDate,
      source: options.source || "unknown",
    },
  });

  try {
    const epxService = getEPXService();
    const response = await epxService.createSubscription(payload);

    if (response.success && response.data) {
      const epxSubscriptionId =
        response.data.SubscriptionID || response.data.subscriptionId || response.data.id;

      if (!epxSubscriptionId) {
        return {
          success: false,
          error: "EPX response missing SubscriptionID",
          response: response.data,
        };
      }

      const { error: updateError } = await supabase
        .from("subscriptions")
        .update({
          epx_subscription_id: epxSubscriptionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", options.subscriptionId);

      if (updateError) {
        logEPX({
          level: "error",
          phase: "recurring",
          message: "Failed to update subscription with EPX ID",
          data: { subscriptionId: options.subscriptionId, error: updateError.message },
        });

        return {
          success: false,
          error: `Subscription update failed: ${updateError.message}`,
          response: response.data,
        };
      }

      logEPX({
        level: "info",
        phase: "recurring",
        message: "EPX subscription created successfully",
        data: {
          subscriptionId: options.subscriptionId,
          epxSubscriptionId,
          memberId: member.id,
        },
      });

      return {
        success: true,
        epxSubscriptionId,
        response: response.data,
      };
    }

    const errorMessage = response.error || "EPX subscription creation failed";

    logEPX({
      level: "error",
      phase: "recurring",
      message: "EPX create subscription failed",
      data: {
        subscriptionId: options.subscriptionId,
        memberId: member.id,
        error: errorMessage,
      },
    });

    return {
      success: false,
      error: errorMessage,
      response: response.data,
    };
  } catch (error: any) {
    logEPX({
      level: "error",
      phase: "recurring",
      message: "Unhandled EPX subscription exception",
      data: {
        subscriptionId: options.subscriptionId,
        memberId: member.id,
        error: error.message,
      },
    });

    return {
      success: false,
      error: error.message || "Unknown EPX error",
    };
  }
}

export async function recordEpxSubscriptionFailure(params: {
  subscriptionId: number;
  memberId?: number;
  error: string;
  source: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  const metadata = {
    ...(params.metadata || {}),
    source: params.source,
    lastErrorAt: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("admin_notifications")
    .select("id, metadata")
    .eq("type", "epx_subscription_failed")
    .eq("subscription_id", params.subscriptionId)
    .eq("resolved", false)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("admin_notifications")
      .update({
        error_message: params.error,
        metadata: {
          ...(typeof existing.metadata === "object" && existing.metadata ? existing.metadata : {}),
          ...metadata,
        },
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("admin_notifications").insert({
    type: "epx_subscription_failed",
    member_id: params.memberId || null,
    subscription_id: params.subscriptionId,
    error_message: params.error,
    metadata,
    resolved: false,
    created_at: new Date().toISOString(),
  });
}

export async function resolveEpxSubscriptionFailure(params: {
  subscriptionId: number;
  resolvedBy?: string;
  epxSubscriptionId?: string;
}): Promise<void> {
  const { data, error } = await supabase
    .from("admin_notifications")
    .select("id, metadata")
    .eq("type", "epx_subscription_failed")
    .eq("subscription_id", params.subscriptionId)
    .eq("resolved", false);

  if (error || !data?.length) {
    return;
  }

  for (const notification of data) {
    const metadata =
      (typeof notification.metadata === "object" && notification.metadata ? notification.metadata : {});

    await supabase
      .from("admin_notifications")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: params.resolvedBy || null,
        metadata: {
          ...metadata,
          epxSubscriptionId: params.epxSubscriptionId || metadata.epxSubscriptionId,
          resolvedAt: new Date().toISOString(),
        },
      })
      .eq("id", notification.id);
  }
}

interface PendingSubscriptionRecord {
  id: number;
  amount: string | number | null;
  status: string;
  created_at: string;
  members: MemberRecord;
}

export async function processPendingRecurringSubscriptions(limit: number = 10) {
  if (!RECURRING_ENABLED) {
    logEPX({ level: "info", phase: "scheduler", message: "Recurring billing disabled; skipping scheduler tick" });
    return { attempted: 0, linked: 0, failures: 0 };
  }
  const minAgeMinutes = parseInt(process.env.BILLING_SCHEDULER_MIN_AGE_MINUTES || "10", 10);
  const minAgeDate = new Date(Date.now() - minAgeMinutes * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("subscriptions")
    .select("id, amount, status, created_at, members!inner(*)")
    .is("epx_subscription_id", null)
    .eq("status", "active")
    .lt("created_at", minAgeDate)
    .limit(limit);

  if (error) {
    logEPX({
      level: "error",
      phase: "scheduler",
      message: "Failed to load pending EPX subscriptions",
      data: { error: error.message },
    });
    return { attempted: 0, linked: 0, failures: 0 };
  }

  const records = (data || []) as PendingSubscriptionRecord[];
  let attempted = 0;
  let linked = 0;
  let failures = 0;

  for (const record of records) {
    const member = record.members;
    if (!member || !(member.payment_token || member.paymentToken)) {
      continue;
    }

    attempted += 1;

    const result = await createRecurringSubscription({
      member,
      subscriptionId: record.id,
      amount: record.amount,
      billingDate: getMemberValue(member, "firstPaymentDate", "first_payment_date") || record.created_at,
      paymentToken: getMemberValue(member, "paymentToken", "payment_token"),
      paymentMethodType: getMemberValue(member, "paymentMethodType", "payment_method_type"),
      source: "scheduler",
    });

    if (result.success && result.epxSubscriptionId) {
      linked += 1;
      await resolveEpxSubscriptionFailure({
        subscriptionId: record.id,
        epxSubscriptionId: result.epxSubscriptionId,
      });
    } else {
      failures += 1;
      await recordEpxSubscriptionFailure({
        subscriptionId: record.id,
        memberId: member.id,
        error: result.error || "Unknown scheduler error",
        source: "scheduler",
      });
    }
  }

  logEPX({
    level: "info",
    phase: "scheduler",
    message: "Recurring billing scheduler tick",
    data: { attempted, linked, failures },
  });

  return { attempted, linked, failures };
}

let schedulerHandle: NodeJS.Timeout | null = null;

export function scheduleRecurringBillingSync() {
  const enabled = RECURRING_ENABLED && (process.env.BILLING_SCHEDULER_ENABLED || "false").toLowerCase() === "true";

  if (!enabled) {
    logEPX({
      level: "info",
      phase: "scheduler",
      message: "Recurring billing scheduler disabled via env",
    });
    return;
  }

  const intervalMinutes = Math.max(parseInt(process.env.BILLING_SCHEDULER_INTERVAL_MINUTES || "30", 10), 5);
  const intervalMs = intervalMinutes * 60 * 1000;

  logEPX({
    level: "info",
    phase: "scheduler",
    message: "Recurring billing scheduler enabled",
    data: { intervalMinutes },
  });

  processPendingRecurringSubscriptions().catch((error) => {
    logEPX({
      level: "error",
      phase: "scheduler",
      message: "Initial recurring scheduler run failed",
      data: { error: error.message },
    });
  });

  schedulerHandle = setInterval(() => {
    processPendingRecurringSubscriptions().catch((error) => {
      logEPX({
        level: "error",
        phase: "scheduler",
        message: "Recurring scheduler tick failed",
        data: { error: error.message },
      });
    });
  }, intervalMs);
}

export function stopRecurringBillingSync() {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}

interface TestSubscriptionInput {
  customerId: string;
  planName: string;
  amount: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  billingDate: string;
  cardNumber: string;
  expiryDate: string;
  cvv: string;
}

export async function createTestSubscription(input: TestSubscriptionInput) {
  if (!RECURRING_ENABLED) {
    return {
      success: false,
      error: "Recurring billing disabled",
    };
  }
  const payload: EPXCreateSubscriptionRequest = {
    CustomerData: {
      FirstName: input.firstName,
      LastName: input.lastName,
      Email: input.email,
      Phone: input.phone || "1234567890",
    },
    PaymentMethod: {
      CreditCardData: {
        AccountNumber: input.cardNumber,
        ExpirationDate: input.expiryDate,
        CVV: input.cvv,
        FirstName: input.firstName,
        LastName: input.lastName,
      },
    },
    SubscriptionData: {
      Amount: input.amount,
      Frequency: "Monthly",
      BillingDate: input.billingDate,
      FailureOption: "Forward",
      NumberOfPayments: 3,
      Retries: 1,
      Description: input.planName,
    },
  };

  const epxService = getEPXService();
  return epxService.createSubscription(payload);
}
