import { query, transaction } from "../lib/neonDb";
import { storage } from "../storage";
import { isAtLeastAdmin } from "../auth/roles";
import { requireCanonicalPaymentCredential } from "./payment-credential";
import { calculateNextBillingCycleDate } from "../utils/membership-dates";

export type PaymentMethodAction = "add" | "replace" | "pay_now";

interface PaymentMethodActor {
  id: string;
  email?: string | null;
  role?: string | null;
}

interface ActivateHostedPaymentMethodInput {
  paymentId: number;
  memberId: number;
  actor: PaymentMethodActor;
  action: PaymentMethodAction;
  replaceTokenId?: number | null;
  bricToken: string;
  authGuid: string;
  cardType?: string | null;
  cardLastFour: string;
  expiryMonth?: string | null;
  expiryYear?: string | null;
  authCode?: string | null;
  responseCode?: string | null;
  responseMessage?: string | null;
}

export interface ActivatedPaymentMethodResult {
  paymentId: number;
  memberId: number;
  subscriptionId: number;
  paymentTokenId: number;
  cycleId: number | null;
  billedCycleDate: string | null;
  nextBillingDate: string | null;
  alreadyCompleted: boolean;
}

const successfulStatuses = new Set(["success", "succeeded", "completed"]);

export async function canManageMemberPaymentMethods(
  memberId: number,
  actor: PaymentMethodActor | null | undefined,
): Promise<boolean> {
  if (!actor) return false;
  if (isAtLeastAdmin(actor.role)) return true;

  const member = await storage.getMember(memberId);
  if (!member) return false;
  return (
    member.enrolledByAgentId === actor.id ||
    (member as any).enrolled_by_agent_id === actor.id
  );
}

export async function listMemberPaymentMethods(memberId: number) {
  const result = await query(
    `SELECT id, payment_method_type,
            CASE
              WHEN LENGTH(COALESCE(bric_token, '')) > 8
                THEN LEFT(bric_token, 4) || '****' || RIGHT(bric_token, 4)
              WHEN bric_token IS NOT NULL THEN '********'
              ELSE NULL
            END AS bric_reference,
            original_network_trans_id AS auth_guid,
            card_type, card_last_four, expiry_month, expiry_year,
            is_active, is_primary, created_at, last_used_at
     FROM payment_tokens
     WHERE member_id = $1
     ORDER BY is_active DESC, is_primary DESC, created_at DESC, id DESC`,
    [memberId],
  );
  return result.rows;
}

async function insertAudit(
  client: any,
  input: {
    memberId: number;
    subscriptionId?: number | null;
    actor: PaymentMethodActor;
    changeType: string;
    details: Record<string, unknown>;
  },
) {
  await client.query(
    `INSERT INTO enrollment_modifications (
       member_id, subscription_id, modified_by, change_type,
       change_details, created_at
     ) VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
    [
      input.memberId,
      input.subscriptionId || null,
      input.actor.id,
      input.changeType,
      JSON.stringify({
        ...input.details,
        performedByEmail: input.actor.email || null,
        performedByRole: input.actor.role || null,
      }),
    ],
  );
}

export async function makeDefaultPaymentMethod(input: {
  memberId: number;
  paymentTokenId: number;
  actor: PaymentMethodActor;
}) {
  let selected: any = null;
  await transaction(async (client) => {
    await client.query("SELECT id FROM members WHERE id = $1 FOR UPDATE", [
      input.memberId,
    ]);
    const tokenResult = await client.query(
      `SELECT id, payment_method_type, bric_token, original_network_trans_id
       FROM payment_tokens
       WHERE id = $1 AND member_id = $2 AND is_active = true
       FOR UPDATE`,
      [input.paymentTokenId, input.memberId],
    );
    selected = tokenResult.rows[0];
    if (!selected) throw new Error("Active payment method not found");

    await client.query(
      "UPDATE payment_tokens SET is_primary = (id = $2) WHERE member_id = $1 AND is_active = true",
      [input.memberId, input.paymentTokenId],
    );
    await client.query(
      `UPDATE members
       SET payment_token = $2, payment_method_type = $3, updated_at = NOW()
       WHERE id = $1`,
      [
        input.memberId,
        selected.original_network_trans_id || selected.bric_token,
        selected.payment_method_type,
      ],
    );
    await insertAudit(client, {
      memberId: input.memberId,
      actor: input.actor,
      changeType: "payment_method_default_changed",
      details: { paymentTokenId: input.paymentTokenId },
    });
  });
  return { paymentTokenId: Number(selected.id) };
}

export async function removePaymentMethod(input: {
  memberId: number;
  paymentTokenId: number;
  replacementTokenId?: number | null;
  switchToManualBilling?: boolean;
  actor: PaymentMethodActor;
}) {
  await transaction(async (client) => {
    await client.query("SELECT id FROM members WHERE id = $1 FOR UPDATE", [
      input.memberId,
    ]);
    const tokenResult = await client.query(
      `SELECT id, is_primary
       FROM payment_tokens
       WHERE id = $1 AND member_id = $2 AND is_active = true
       FOR UPDATE`,
      [input.paymentTokenId, input.memberId],
    );
    const token = tokenResult.rows[0];
    if (!token) throw new Error("Active payment method not found");

    let replacement: any = null;
    if (token.is_primary && input.replacementTokenId) {
      const replacementResult = await client.query(
        `SELECT id, payment_method_type, bric_token, original_network_trans_id
         FROM payment_tokens
         WHERE id = $1 AND member_id = $2 AND is_active = true AND id <> $3
         FOR UPDATE`,
        [input.replacementTokenId, input.memberId, input.paymentTokenId],
      );
      replacement = replacementResult.rows[0];
      if (!replacement) throw new Error("Replacement payment method not found");
    }

    if (token.is_primary && !replacement && !input.switchToManualBilling) {
      throw new Error(
        "Removing the default payment method requires a replacement default or manual billing",
      );
    }

    await client.query(
      `UPDATE payment_tokens
       SET is_active = false, is_primary = false
       WHERE id = $1`,
      [input.paymentTokenId],
    );

    if (replacement) {
      await client.query(
        "UPDATE payment_tokens SET is_primary = (id = $2) WHERE member_id = $1 AND is_active = true",
        [input.memberId, replacement.id],
      );
      await client.query(
        `UPDATE members
         SET payment_token = $2, payment_method_type = $3, updated_at = NOW()
         WHERE id = $1`,
        [
          input.memberId,
          replacement.original_network_trans_id || replacement.bric_token,
          replacement.payment_method_type,
        ],
      );
    } else if (token.is_primary && input.switchToManualBilling) {
      await client.query(
        `UPDATE subscriptions
         SET billing_mode = 'manual_external', updated_at = NOW()
         WHERE member_id = $1 AND status = 'active'`,
        [input.memberId],
      );
      await client.query(
        "UPDATE members SET payment_token = NULL, updated_at = NOW() WHERE id = $1",
        [input.memberId],
      );
    }

    await insertAudit(client, {
      memberId: input.memberId,
      actor: input.actor,
      changeType: "payment_method_removed",
      details: {
        paymentTokenId: input.paymentTokenId,
        replacementTokenId: replacement ? Number(replacement.id) : null,
        switchedToManualBilling: Boolean(input.switchToManualBilling),
      },
    });
  });
  return { removedPaymentTokenId: input.paymentTokenId };
}

export async function activateHostedPaymentMethod(
  input: ActivateHostedPaymentMethodInput,
): Promise<ActivatedPaymentMethodResult> {
  const bricToken = requireCanonicalPaymentCredential(input.bricToken);
  const authGuid = requireCanonicalPaymentCredential(input.authGuid);
  const lastFour = String(input.cardLastFour || "").replace(/\D/g, "");
  if (lastFour.length !== 4) {
    throw new Error("Verified callback did not include card last four");
  }

  let output: ActivatedPaymentMethodResult | null = null;
  await transaction(async (client) => {
    const paymentResult = await client.query(
      `SELECT p.id, p.member_id, p.subscription_id, p.amount, p.status,
              p.transaction_id, p.created_at, p.metadata,
              m.first_payment_date, m.enrollment_date
       FROM payments p
       JOIN members m ON m.id = p.member_id
       WHERE p.id = $1 AND p.member_id = $2
       FOR UPDATE OF p, m`,
      [input.paymentId, input.memberId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new Error("Payment method callback member mismatch");
    if (!successfulStatuses.has(String(payment.status || "").toLowerCase())) {
      throw new Error(
        "Payment method activation requires a successful payment",
      );
    }

    const existingAudit = await client.query(
      `SELECT change_details
       FROM enrollment_modifications
       WHERE member_id = $1
         AND change_type = 'payment_method_activated'
         AND change_details->>'paymentId' = $2
       ORDER BY id DESC LIMIT 1`,
      [input.memberId, String(input.paymentId)],
    );
    if (existingAudit.rows[0]?.change_details?.result) {
      output = {
        ...existingAudit.rows[0].change_details.result,
        alreadyCompleted: true,
      };
      return;
    }

    const subscriptionResult = await client.query(
      `SELECT id, amount, status, next_billing_date
       FROM subscriptions
       WHERE id = $1 AND member_id = $2
       FOR UPDATE`,
      [Number(payment.subscription_id), input.memberId],
    );
    const subscription = subscriptionResult.rows[0];
    if (
      !subscription ||
      String(subscription.status).toLowerCase() !== "active"
    ) {
      throw new Error(
        "Payment method activation requires an active subscription",
      );
    }
    if (
      input.action === "pay_now" &&
      Number(subscription.amount).toFixed(2) !==
        Number(payment.amount).toFixed(2)
    ) {
      throw new Error(
        "Hosted payment must equal the subscription billing amount",
      );
    }
    if (input.action === "pay_now" && !subscription.next_billing_date) {
      throw new Error("Active subscription has no next billing date");
    }

    let cycle: any = null;
    let billedCycleDate: string | null = null;
    let nextBillingDate: string | null = null;
    if (input.action === "pay_now") {
      const cycleResult = await client.query(
        `SELECT id, cycle_date
         FROM recurring_billing_cycles
         WHERE subscription_id = $1 AND member_id = $2
           AND payment_id IS NULL AND state IN ('declined', 'unknown')
           AND amount = $3 AND cycle_date = $4::date
         ORDER BY id LIMIT 1 FOR UPDATE`,
        [
          subscription.id,
          input.memberId,
          payment.amount,
          subscription.next_billing_date,
        ],
      );
      cycle = cycleResult.rows[0] || null;
      billedCycleDate = new Date(
        cycle?.cycle_date || subscription.next_billing_date,
      )
        .toISOString()
        .slice(0, 10);
      const anchorSource =
        payment.first_payment_date || payment.enrollment_date;
      const anchorDay = anchorSource
        ? new Date(anchorSource).getUTCDate()
        : Number(billedCycleDate.slice(-2));
      nextBillingDate = calculateNextBillingCycleDate(
        billedCycleDate,
        anchorDay,
      );
    }

    const existingTokens = await client.query(
      `SELECT id, is_primary FROM payment_tokens
       WHERE member_id = $1 AND is_active = true FOR UPDATE`,
      [input.memberId],
    );
    const replacedTokenId =
      input.action === "replace"
        ? Number(
            input.replaceTokenId ||
              existingTokens.rows.find((row: any) => row.is_primary)?.id,
          )
        : null;
    if (input.action === "replace" && !replacedTokenId) {
      throw new Error("Replace requires an active payment method");
    }

    if (replacedTokenId) {
      await client.query(
        `UPDATE payment_tokens SET is_active = false, is_primary = false
         WHERE id = $1 AND member_id = $2 AND is_active = true`,
        [replacedTokenId, input.memberId],
      );
    }
    const makePrimary =
      input.action !== "add" ||
      !existingTokens.rows.some(
        (row: any) => row.is_primary && Number(row.id) !== replacedTokenId,
      );
    if (makePrimary) {
      await client.query(
        "UPDATE payment_tokens SET is_primary = false WHERE member_id = $1 AND is_active = true",
        [input.memberId],
      );
    }

    const tokenResult = await client.query(
      `INSERT INTO payment_tokens (
         member_id, payment_method_type, bric_token, card_type, card_last_four,
         expiry_month, expiry_year, original_network_trans_id,
         is_active, is_primary, created_at, last_used_at
      ) VALUES ($1, 'CreditCard', $2, $3, $4, $5, $6, $7, true, $8, NOW(),
           CASE WHEN $9::boolean THEN NOW() ELSE NULL END)
       ON CONFLICT (bric_token) DO UPDATE SET
         member_id = EXCLUDED.member_id, payment_method_type = 'CreditCard',
         card_type = EXCLUDED.card_type, card_last_four = EXCLUDED.card_last_four,
         expiry_month = EXCLUDED.expiry_month, expiry_year = EXCLUDED.expiry_year,
         original_network_trans_id = EXCLUDED.original_network_trans_id,
         is_active = true, is_primary = EXCLUDED.is_primary,
         last_used_at = CASE WHEN $9::boolean THEN NOW() ELSE payment_tokens.last_used_at END
       RETURNING id`,
      [
        input.memberId,
        bricToken,
        input.cardType || null,
        lastFour,
        input.expiryMonth || null,
        input.expiryYear || null,
        authGuid,
        makePrimary,
        input.action === "pay_now",
      ],
    );
    const paymentTokenId = Number(tokenResult.rows[0]?.id);
    if (!paymentTokenId)
      throw new Error("Payment method insert returned no id");

    if (makePrimary) {
      await client.query(
        `UPDATE payment_tokens SET is_primary = false
         WHERE member_id = $1 AND is_active = true AND id <> $2`,
        [input.memberId, paymentTokenId],
      );
      await client.query(
        `UPDATE members SET payment_token = $2,
           payment_method_type = 'CreditCard', updated_at = NOW() WHERE id = $1`,
        [input.memberId, authGuid],
      );
    }

    if (input.action === "pay_now") {
      await client.query(
        `UPDATE subscriptions SET billing_mode = 'automatic',
           current_period_start = $2::date,
           current_period_end = $3::date, next_billing_date = $3::date,
           updated_at = NOW() WHERE id = $1`,
        [subscription.id, billedCycleDate, nextBillingDate],
      );
    }
    if (cycle) {
      await client.query(
        `UPDATE recurring_billing_cycles SET state = 'completed', payment_id = $2,
           processor_auth_guid = $3, processor_auth_code = $4,
           processor_response_code = $5, processor_response_message = $6,
           processor_responded_at = NOW(), next_billing_date = $7::date,
           next_attempt_at = NULL, failure_classification = NULL, skip_reason = NULL,
           completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [
          cycle.id,
          input.paymentId,
          authGuid,
          input.authCode || null,
          input.responseCode || "00",
          input.responseMessage || "APPROVED",
          nextBillingDate,
        ],
      );
    }

    const activated: ActivatedPaymentMethodResult = {
      paymentId: input.paymentId,
      memberId: input.memberId,
      subscriptionId: Number(subscription.id),
      paymentTokenId,
      cycleId: cycle ? Number(cycle.id) : null,
      billedCycleDate,
      nextBillingDate,
      alreadyCompleted: false,
    };
    await insertAudit(client, {
      memberId: input.memberId,
      subscriptionId: Number(subscription.id),
      actor: input.actor,
      changeType: "payment_method_activated",
      details: {
        paymentId: String(input.paymentId),
        action: input.action,
        replacedTokenId,
        paymentTokenId,
        cardType: input.cardType || null,
        cardLastFour: lastFour,
        expiryMonth: input.expiryMonth || null,
        expiryYear: input.expiryYear || null,
        result: activated,
      },
    });
    await client.query(
      `UPDATE payments SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{paymentMethodManagement}',
         COALESCE(metadata->'paymentMethodManagement', '{}'::jsonb) || $2::jsonb
       ),
       updated_at = NOW() WHERE id = $1`,
      [
        input.paymentId,
        JSON.stringify({
          status: "completed",
          action: input.action,
          paymentTokenId,
          completedAt: new Date().toISOString(),
          completedByUserId: input.actor.id,
        }),
      ],
    );
    output = activated;
  });

  if (!output) throw new Error("Payment method activation returned no result");
  return output;
}
