import assert from "node:assert/strict";
process.env.DATABASE_URL ||= "postgresql://postgres:postgres@127.0.0.1:5432/catchup_mock_test";
process.env.ONE_TIME_CATCHUP_ENABLED = "true";
// Fake, nonfunctional key only for imports that initialize Supabase at module load.
// The injected mock processor and DB do not contact this URL or use this key.
process.env.SUPABASE_URL = "https://catchup-test.invalid";
const jwtPart = (value: Record<string,string>) => Buffer.from(JSON.stringify(value)).toString("base64url");
process.env.SUPABASE_SERVICE_ROLE_KEY = jwtPart({alg:"HS256",typ:"JWT"}) + "." + jwtPart({role:"service_role"}) + ".test-only";

const { chargeOneTimeCatchup, CatchupError } =
  await import("../server/services/one-time-catchup-service");

function scenario(options: {
  response?: "approved" | "declined" | "unknown";
  duplicate?: boolean;
  cancelled?: boolean;
  failLedger?: boolean;
} = {}) {
  const sql: string[] = [];
  let processorCalls = 0;
  const withTransaction = async (fn: (db: any) => Promise<void>) => {
    await fn({ query: async (statement: string) => {
      sql.push(statement);
      if (statement.includes("SELECT s.id subscription_id")) return { rows: [{
        subscription_id: 61, amount:"123.76", subscription_status:"active",
        next_billing_date:"2026-08-17T14:11:50.271Z", member_id:56,
        first_name:"Lawerence",last_name:"Harris",
        member_status:options.cancelled ? "cancelled" : "active",
        customer_number:"MPP56",token_id:100,payment_method_type:"CreditCard",
        bric_token:"VALIDBRICREFERENCE123",original_network_trans_id:null
      }] };
      if (statement.includes("SELECT EXISTS(SELECT 1 FROM one_time_catchup_attempts"))
        return { rows:[{earlier_attempt: Boolean(options.duplicate),protected_cycle:false,existing_payment:false}] };
      if (statement.includes("INSERT INTO one_time_catchup_attempts")) return {rows:[{id:500}]};
      if (statement.includes("INSERT INTO payments")) {
        if (options.failLedger) throw new Error("Simulated ledger outage");
        return {rows:[{id:900}]};
      }
      if (statement.includes("UPDATE one_time_catchup_attempts") ||
          statement.includes("INSERT INTO enrollment_modifications"))
        return {rows:[],rowCount:1};
      throw new Error("Unexpected SQL operation in test: " + statement.slice(0,80));
    } });
  };
  const submit = async (_input: any) => {
    processorCalls++;
    const mode=options.response ?? "approved";
    if (mode==="unknown") return {success:false,requestFields:{TRAN_NBR:"987654"},
      responseFields:{},requestPayload:"",rawResponse:"",error:"network timeout"};
    if (mode==="declined") return {success:false,requestFields:{TRAN_NBR:"987654"},
      responseFields:{AUTH_RESP:"05"},requestPayload:"",rawResponse:"",error:"declined"};
    return {success:true,requestFields:{TRAN_NBR:"987654"},
      responseFields:{AUTH_RESP:"00",AUTH_GUID:"NEWPROCESSORGUID123",AUTH_CODE:"ABC123"},
      requestPayload:"",rawResponse:""};
  };
  const charge = () => chargeOneTimeCatchup({
    memberId:56,cycleMonth:"2026-08",actor:{id:"00000000-0000-4000-8000-000000000001"},
    confirmation:"CHARGE ONE PAYMENT"
  },{withTransaction:withTransaction as any,submit:submit as any});
  return {charge,sql,getProcessorCalls:()=>processorCalls};
}

const approved=scenario();
const success=await approved.charge();
assert.equal(success.status,"succeeded");
assert.equal(success.success,true);
assert.equal(success.amount,"123.76");
assert.equal(success.nextBillingDateUnchanged,"2026-08-17");
assert.equal(approved.getProcessorCalls(),1);
assert.equal(approved.sql.some(s=>/UPDATE\s+subscriptions|UPDATE\s+recurring_billing_cycles/i.test(s)),false);
assert.equal(approved.sql.some(s=>s.includes("INSERT INTO payments")),true);

const declined=scenario({response:"declined"});
assert.equal((await declined.charge()).status,"declined");
assert.equal(declined.getProcessorCalls(),1);
assert.equal(declined.sql.some(s=>s.includes("INSERT INTO payments")),false);

const unknown=scenario({response:"unknown"});
assert.equal((await unknown.charge()).status,"unknown");
assert.equal(unknown.sql.some(s=>s.includes("INSERT INTO payments")),false);

const duplicate=scenario({duplicate:true});
await assert.rejects(duplicate.charge(),(error:any)=> error instanceof CatchupError && error.status===409);
assert.equal(duplicate.getProcessorCalls(),0);

const cancelled=scenario({cancelled:true});
await assert.rejects(cancelled.charge(),(error:any)=> error instanceof CatchupError && error.status===409);
assert.equal(cancelled.getProcessorCalls(),0);

const ledger=scenario({failLedger:true});
assert.equal((await ledger.charge()).status,"record_pending");
assert.equal(ledger.getProcessorCalls(),1);

console.log("Mock one-time catch-up: PASS (approval, decline, unknown, duplicate, cancelled, ledger failure, unchanged schedule)");
