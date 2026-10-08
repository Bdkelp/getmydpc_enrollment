import { randomUUID } from "node:crypto";
import { transaction } from "../lib/neonDb";
import { resolveCanonicalPaymentCredential } from "./payment-credential";
import { submitServerPostRecurringPayment } from "./epx-payment-service";

/**
 * Dedicated, schedule-neutral recovery payment. A separate durable attempt is
 * committed *before* calling EPX. Unknown outcomes must be reconciled in North
 * and are never retried automatically.
 */
export class CatchupError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
type Actor = { id: string; email?: string | null };
type Reservation = {
  id: number; memberId: number; subscriptionId: number; amount: string;
  cycleMonth: string; reference: string; tranNbr: string;
  member: Record<string, any>; previousNextBillingDate: string;
};

type CatchupDeps = {
  withTransaction: typeof transaction;
  submit: typeof submitServerPostRecurringPayment;
};

export async function chargeOneTimeCatchup(input: {
  memberId: number; cycleMonth: string; actor: Actor;
  confirmation: string;
}, deps: CatchupDeps = { withTransaction: transaction, submit: submitServerPostRecurringPayment }) {
  if (process.env.ONE_TIME_CATCHUP_ENABLED !== "true") {
    throw new CatchupError(503, "One-time catch-up collection has not been enabled");
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.cycleMonth)) {
    throw new CatchupError(400, "Billing month must be YYYY-MM");
  }
  if (input.confirmation !== "CHARGE ONE PAYMENT") {
    throw new CatchupError(400, "Explicit one-payment confirmation required");
  }
  const requestKey = randomUUID();
  const tranNbr = requestKey; // EPX normalizes this into its on-wire transaction number.
  let reservation!: Reservation;

  await deps.withTransaction(async (db) => {
    const found = await db.query(
      `SELECT s.id subscription_id, s.amount, s.status subscription_status,
              s.next_billing_date, m.id member_id, m.first_name, m.last_name,
              m.status member_status, m.customer_number,
              t.id token_id, t.payment_method_type, t.bric_token,
              t.original_network_trans_id
       FROM members m JOIN subscriptions s ON s.member_id = m.id
       LEFT JOIN LATERAL (
         SELECT id, payment_method_type, bric_token, original_network_trans_id
         FROM payment_tokens WHERE member_id=m.id AND is_active AND is_primary
         ORDER BY id DESC LIMIT 1
       ) t ON true
       WHERE m.id=$1 AND s.status='active'
       ORDER BY s.id DESC LIMIT 1 FOR UPDATE OF m, s`, [input.memberId]);
    const x = found.rows[0];
    if (!x || x.member_status === "cancelled" || !x.next_billing_date) {
      throw new CatchupError(409, "Active member and subscription required");
    }
    if (x.payment_method_type !== "CreditCard") {
      throw new CatchupError(409, "An active default card credential is required");
    }
    const fromOriginal = resolveCanonicalPaymentCredential(x.original_network_trans_id);
    const fromBric = resolveCanonicalPaymentCredential(x.bric_token);
    const reference = !fromOriginal.error ? fromOriginal.credential : fromBric.credential;
    if (!reference) throw new CatchupError(409, "No usable processor reference");
    if (!Number.isFinite(Number(x.amount)) || Number(x.amount) <= 0) {
      throw new CatchupError(409, "Invalid subscription amount");
    }
    // Keep subscription dates unchanged. A second later-month catch-up is
    // allowed only after the immediately preceding month has a successful
    // standalone catch-up recorded in our durable ledger.
    const earliestMonth = new Date(x.next_billing_date).toISOString().slice(0,7);
    const nowChicago = new Intl.DateTimeFormat("en-CA",{
      timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date()).slice(0,7);
    if (input.cycleMonth < earliestMonth || input.cycleMonth > nowChicago) {
      throw new CatchupError(409, "Month is outside the unpaid billing window");
    }
    if (input.cycleMonth !== earliestMonth) {
      const previousMonth = new Date(input.cycleMonth + "-01T12:00:00Z");
      previousMonth.setUTCMonth(previousMonth.getUTCMonth()-1);
      const prior = await db.query(
        `SELECT state FROM one_time_catchup_attempts WHERE subscription_id=$1
           AND cycle_month=$2::date`,
        [x.subscription_id,previousMonth.toISOString().slice(0,7)+"-01"]);
      if (prior.rows[0]?.state !== "succeeded") {
        throw new CatchupError(409, "Collect and verify the preceding month first");
      }
    }
    const conflict = await db.query(
      `SELECT EXISTS(SELECT 1 FROM one_time_catchup_attempts
          WHERE subscription_id=$1 AND cycle_month=$2::date) AS earlier_attempt,
         EXISTS(SELECT 1 FROM recurring_billing_cycles
          WHERE subscription_id=$1 AND cycle_date >= $2::date
            AND cycle_date < ($2::date + interval '1 month')
            AND state IN ('completed','submitting','unknown','processor_succeeded','internal_sync_pending')) AS protected_cycle,
         EXISTS(SELECT 1 FROM payments
          WHERE subscription_id=$1 AND created_at >= $2::date
            AND created_at < ($2::date + interval '1 month')
            AND status IN ('success','succeeded','completed')) AS existing_payment`,
      [x.subscription_id, `${input.cycleMonth}-01`]);
    const c = conflict.rows[0];
    if (c.earlier_attempt || c.protected_cycle || c.existing_payment) {
      throw new CatchupError(409, "Payment or in-flight attempt already recorded for this month");
    }
    const inserted = await db.query(
      `INSERT INTO one_time_catchup_attempts
       (request_key,member_id,subscription_id,cycle_month,amount,processor_reference,
        state,initiated_by,submitted_at)
       VALUES ($1,$2,$3,$4::date,$5,$6,'submitting',$7,NOW()) RETURNING id`,
      [requestKey,x.member_id,x.subscription_id,`${input.cycleMonth}-01`,x.amount,tranNbr,input.actor.id]);
    reservation = {
      id:Number(inserted.rows[0].id),memberId:Number(x.member_id),
      subscriptionId:Number(x.subscription_id),amount:String(x.amount),
      cycleMonth:input.cycleMonth,reference,tranNbr,
      member:{id:x.member_id,firstName:x.first_name,lastName:x.last_name,customerNumber:x.customer_number},
      previousNextBillingDate:new Date(x.next_billing_date).toISOString().slice(0,10)
    };
  });

  // EPX may capture even when the connection times out. Never resubmit this request.
  let outcome: Awaited<ReturnType<typeof submitServerPostRecurringPayment>>;
  try {
    outcome = await deps.submit({
      amount:Number(reservation.amount), authGuid:reservation.reference,
      tranType:"CCE1", tranNbr:reservation.tranNbr, member:reservation.member,
      description:`Admin one-time catch-up ${reservation.cycleMonth}`,
      metadata:{source:"admin_one_time_catchup",attemptId:reservation.id}
    });
  } catch {
    await markUnknown(reservation.id, null, deps.withTransaction);
    return {success:false,status:"unknown",message:"Processor outcome unknown; inspect North before any additional charge"};
  }
  const epxTranNbr=String(outcome.requestFields?.TRAN_NBR || "");
  if (!outcome.success) {
    // A timeout, HTTP failure, or malformed response is NOT evidence of a decline.
    const code = outcome.responseFields?.AUTH_RESP;
    const decline = Boolean(code && /^(?:05|51|54|N|DECLINED)$/i.test(String(code)));
    await deps.withTransaction(async (db) => {
      await db.query("UPDATE one_time_catchup_attempts SET state=$2,processor_response_code=$3,epx_tran_nbr=$4,updated_at=NOW(),completed_at=NOW() WHERE id=$1",
        [reservation.id,decline?"declined":"unknown",code||null,epxTranNbr||null]);
    });
    return {success:false,status:decline?"declined":"unknown",
      message:decline?"EPX declined the payment":"Processor outcome unverified; inspect North before retrying"};
  }
  const code=outcome.responseFields?.AUTH_RESP;
  const authGuid=outcome.responseFields?.AUTH_GUID || outcome.responseFields?.GUID;
  if (!code || !authGuid || !epxTranNbr) {
    await markUnknown(reservation.id,epxTranNbr,deps.withTransaction);
    return {success:false,status:"unknown",message:"Approval lacks verifiable processor reference; reconcile in North"};
  }
  try {
    let paymentId!:number;
    await deps.withTransaction(async (db)=>{
      const result=await db.query(
        `INSERT INTO payments (member_id,subscription_id,amount,currency,status,
           transaction_id,payment_method,payment_method_type,epx_auth_guid,metadata,created_at,updated_at)
         VALUES ($1,$2,$3,'USD','succeeded',$4,'card','CreditCard',$5,$6::jsonb,NOW(),NOW())
         RETURNING id`,
        [reservation.memberId,reservation.subscriptionId,reservation.amount,epxTranNbr,
         authGuid,JSON.stringify({source:"admin_one_time_catchup",cycleMonth:reservation.cycleMonth,
           attemptId:reservation.id,operatorId:input.actor.id,scheduledBillingDateUnchanged:true})]);
      paymentId=Number(result.rows[0].id);
      await db.query(
        `UPDATE one_time_catchup_attempts SET state='succeeded',payment_id=$2,
          processor_auth_guid=$3,processor_auth_code=$4,processor_response_code=$5,
          epx_tran_nbr=$6,completed_at=NOW(),updated_at=NOW() WHERE id=$1`,
        [reservation.id,paymentId,authGuid,outcome.responseFields?.AUTH_CODE||null,code,epxTranNbr]);
      await db.query(
        `INSERT INTO enrollment_modifications
          (member_id,subscription_id,modified_by,change_type,change_details,created_at)
         VALUES ($1,$2,$3,'one_time_catchup_payment',$4::jsonb,NOW())`,
        [reservation.memberId,reservation.subscriptionId,input.actor.id,
        JSON.stringify({paymentId,cycleMonth:reservation.cycleMonth,amount:reservation.amount,
          originalBillingDate:reservation.previousNextBillingDate,chargeSubmitted:true})]);
    });
    return {success:true,status:"succeeded",paymentId,amount:reservation.amount,
      nextBillingDateUnchanged:reservation.previousNextBillingDate};
  } catch {
    await deps.withTransaction(async(db)=>{await db.query(
      "UPDATE one_time_catchup_attempts SET state='record_pending',epx_tran_nbr=$2,updated_at=NOW() WHERE id=$1",
      [reservation.id,epxTranNbr]);});
    return {success:false,status:"record_pending",
      message:"EPX approved, but internal payment recording requires repair. Do not charge again."};
  }
}

async function markUnknown(id:number,epxTranNbr:string|null=null,withTransaction:typeof transaction=transaction){
  await withTransaction(async(db)=>{await db.query(
    "UPDATE one_time_catchup_attempts SET state='unknown',epx_tran_nbr=$2,updated_at=NOW() WHERE id=$1",[id,epxTranNbr]);});
}
