import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatCalendarDate } from "../client/src/lib/dateDisplay";
import { getCancellationDateLabel, getSafeCancellationReason } from "../client/src/lib/cancellationDisplay";

assert.equal(getCancellationDateLabel("2026-08-20T00:30:00.000Z"), "8/20/2026");
assert.equal(getCancellationDateLabel(null), "Date unavailable");
assert.equal(getSafeCancellationReason("member_requested"), "Member requested cancellation");
assert.equal(getSafeCancellationReason("Cancelled per member request"), "Member requested cancellation");
assert.equal(getSafeCancellationReason("payment_issue"), "Membership cancelled due to payment issue");
assert.equal(getSafeCancellationReason("private fraud review: member details"), "Reason not specified");
assert.equal(getSafeCancellationReason(null), "Reason not specified");
assert.equal(formatCalendarDate("2026-08-20T00:30:00.000Z"), "8/20/2026");

const dashboard = await readFile(new URL("../client/src/pages/agent-dashboard.tsx", import.meta.url), "utf8");
const commissions = await readFile(new URL("../client/src/pages/agent-commissions.tsx", import.meta.url), "utf8");
const storage = await readFile(new URL("../server/storage.ts", import.meta.url), "utf8");
const auth = await readFile(new URL("../client/src/hooks/useAgentDashboardQueries.ts", import.meta.url), "utf8");
const commissionCenter = await readFile(new URL("../client/src/pages/commission-center.tsx", import.meta.url), "utf8");

assert.match(dashboard, /cancellationDate/);
assert.match(dashboard, /getSafeCancellationReason/);
assert.match(dashboard, /Date unavailable/);
assert.match(commissions, /getSafeCancellationReason/);
assert.match(commissionCenter, /getSafeCancellationReason/);
assert.match(storage, /cancellationDate: row\.cancellation_date/);
assert.match(auth, /viewingAgentId/);
assert.doesNotMatch(dashboard, /\{enrollment\.cancellationReason\}/);
assert.doesNotMatch(commissions, /\{row\.cancellationReason\}/);

console.log("Cancellation display regression tests passed.");
console.log("Confirmed: date-only rendering, safe reason mapping, missing-date/reason fallbacks, raw-note suppression, existing agent API fields, and View-as-Agent query wiring.");
