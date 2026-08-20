import "dotenv/config";
import { neonPool } from "../server/lib/neonDb";
import {
  applyHistoricalExternalSettlement,
  ensureHistoricalCutover,
  loadHistoricalSettlementPlan,
  summarizeHistoricalSettlementPlan,
} from "../server/services/historical-commission-external-settlement-service";

const apply = process.argv.includes("--apply");

const now = await neonPool.query("SELECT NOW() AS cutover_at");
const projectedCutoverAt = now.rows[0].cutover_at as string;

if (!apply) {
  const plan = await loadHistoricalSettlementPlan(projectedCutoverAt);
  console.log(JSON.stringify({
    mode: "dry-run",
    projectedCutoverAt,
    summary: summarizeHistoricalSettlementPlan(plan),
    writingAmountToSettle: plan.rows.filter((row) => row.compensation_type === "writing").reduce((sum, row) => sum + Number(row.commission_amount || 0), 0),
    overrideAmountToSettle: plan.rows.filter((row) => row.compensation_type === "override").reduce((sum, row) => sum + Number(row.commission_amount || 0), 0),
    projectedPostCutoverHistoricalWritingOutstanding: 0,
    projectedPostCutoverHistoricalOverrideOutstanding: 0,
    heldTreatment: "Included and classified as externally settled because the business instruction states all historical obligations were paid; prior held status is preserved in each immutable event.",
    reversedTreatment: "Excluded from settlement; reversed rows remain unchanged.",
    sourceLinkTreatment: "No source_payment_id values are created or guessed.",
  }, null, 2));
} else {
  const cutover = await ensureHistoricalCutover();
  const result = await applyHistoricalExternalSettlement(cutover);
  console.log(JSON.stringify({ mode: "apply", cutover, result }, null, 2));
}

await neonPool.end();