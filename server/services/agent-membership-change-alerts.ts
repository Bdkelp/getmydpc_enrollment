import sgMail from "@sendgrid/mail";
import { query } from "../lib/neonDb";

// Account-change emails intentionally contain IDs and change categories, never member PHI.
export async function recordAgentMembershipChange(input:{
 memberRef:string;actorId:string;actorRole:string;changeType:string;summary:string;
}):Promise<void>{
 if (input.actorRole !== "agent") return;
 const recipient="info@mypremierplans.com";
 await query(`INSERT INTO public.agent_membership_change_alerts
 (member_ref,actor_id,actor_role,change_type,summary,recipient_email)
 VALUES ($1,$2,$3,$4,$5,$6)`,[
  input.memberRef,input.actorId,input.actorRole,input.changeType,input.summary,recipient
 ]);
}
export async function dispatchAgentMembershipChangeAlerts():Promise<void>{
 const key=process.env.SENDGRID_API_KEY;
 if(!key)return;
 sgMail.setApiKey(key);
 const claimed=await query(`UPDATE public.agent_membership_change_alerts SET state='sending',
 attempts=attempts+1,claimed_at=NOW()
 WHERE id IN (SELECT id FROM public.agent_membership_change_alerts
 WHERE (state IN ('pending','failed') AND next_attempt_at<=NOW())
 OR (state='sending' AND claimed_at<NOW()-INTERVAL '15 minutes')
 ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 20)
 RETURNING *`);
 for(const item of claimed.rows){
  try {
   await sgMail.send({
    to:item.recipient_email,
    from:(process.env.SENDGRID_FROM_EMAIL||process.env.COMPANY_EMAIL||"support@mypremierplans.com").trim(),
    subject:`MPP member account changed — ${item.change_type}`,
    text:`An agent updated an MPP membership.\nMember reference: ${item.member_ref}\nAgent user ID: ${item.actor_id}\nChange type: ${item.change_type}\nSummary: ${item.summary}\nRecorded: ${item.created_at}\nReview the change in the secured V1 administration portal.\n`,
   });
   await query(`UPDATE public.agent_membership_change_alerts SET state='sent',sent_at=NOW(),last_error=NULL WHERE id=$1`,[item.id]);
  }catch(e:any){
   console.error("[Member Change Alert] Send failed",item.id,e?.message||e);
   await query(`UPDATE public.agent_membership_change_alerts
   SET state='failed',last_error=$2,next_attempt_at=NOW()+
   (LEAST(60,POWER(2,LEAST(attempts,6)))::int * INTERVAL '1 minute')
   WHERE id=$1`,[item.id],).catch(console.error);
  }
 }
}
export function scheduleAgentMembershipChangeAlerts():void{
 if(!process.env.SENDGRID_API_KEY){console.warn("[Member Change Alert] SendGrid not configured");return;}
 const run=()=>dispatchAgentMembershipChangeAlerts().catch(e=>console.error("[Member Change Alert] Dispatcher error",e));
 void run();setInterval(run,60_000).unref();
}
