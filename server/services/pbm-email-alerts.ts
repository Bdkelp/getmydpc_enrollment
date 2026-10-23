import sgMail from "@sendgrid/mail";
import { query } from "../lib/neonDb";

export function pbmEmailRecipients(): string[] {
 return Array.from(new Set((process.env.PBM_OPERATIONS_ALERT_EMAILS || "info@mypremierplans.com").split(",").map(v=>v.trim().toLowerCase()).filter(v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))));
}
export function formatPbmAlert(change: {id:number; member_id:number;target_enabled:boolean;effective_date:string;amount_delta:string}) {
 const action = change.target_enabled ? "addition" : "removal";
 return {
  subject: `MPP PBM ${action} requested — member #${change.member_id}`,
  text: `PBM ${action} was scheduled for existing member #${change.member_id}.\nChange ID: ${change.id}\nEffective date: ${String(change.effective_date).slice(0,10)}\nMonthly adjustment: ${change.amount_delta}\nNo new activation fee applies.\nReview the secured PBM queue in Admin > Financial Operations.\nDo not activate until payment eligibility has been verified.\n`,
 };
}
// Claims are atomic; multi-instance workers cannot deliver the same unclaimed row simultaneously.
// An ambiguous network failure can still cause a retry; the outbox key prevents duplicate event creation.
export async function dispatchPbmEmailAlerts(): Promise<void> {
 const key=process.env.SENDGRID_API_KEY;
 if (!key || pbmEmailRecipients().length===0) return;
 sgMail.setApiKey(key);
 const claimed = await query(`UPDATE public.pbm_email_outbox o SET state='sending',claimed_at=NOW(),attempts=attempts+1,updated_at=NOW()
 WHERE id IN (SELECT id FROM public.pbm_email_outbox WHERE
 (state IN ('pending','failed') AND next_attempt_at <= NOW())
 OR (state='sending' AND claimed_at < NOW()-INTERVAL '15 minutes')
 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 20)
 RETURNING id, change_id, recipient_email, attempts`);
 for (const item of claimed.rows) {
  try {
   const r = await query(`SELECT id,member_id,target_enabled,effective_date::text AS effective_date,amount_delta::text AS amount_delta
     FROM public.pbm_membership_changes WHERE id=$1`,[item.change_id]);
   if (!r.rows[0]) throw new Error("PBM change missing");
   const email=formatPbmAlert(r.rows[0]);
   await sgMail.send({to:item.recipient_email,from:(process.env.SENDGRID_FROM_EMAIL || process.env.COMPANY_EMAIL || "support@mypremierplans.com").trim(),subject:email.subject,text:email.text});
   await query(`UPDATE public.pbm_email_outbox SET state='sent',sent_at=NOW(),last_error=NULL,updated_at=NOW() WHERE id=$1`,[item.id]);
  } catch(err:any) {
   console.error("[PBM Email] Delivery failed for outbox row",item.id,err?.message || err);
   await query(`UPDATE public.pbm_email_outbox SET state='failed',last_error=$2,next_attempt_at=NOW()+(LEAST(60,POWER(2,LEAST(attempts,6)))::int * INTERVAL '1 minute'),updated_at=NOW() WHERE id=$1`,[item.id],).catch(console.error);
  }
 }
}
export function schedulePbmEmailAlerts() {
 if (!process.env.SENDGRID_API_KEY) {
  console.warn("[PBM Email] Disabled until SENDGRID_API_KEY is configured");
  return;
 }
 const run=()=>dispatchPbmEmailAlerts().catch(e=>console.error("[PBM Email] Dispatcher failed",e));
 void run();
 setInterval(run,60_000).unref();
}
