# EPX Certification Samples Highlights

See also: [docs/epx-certification-samples-11-evidence-matrix.md](docs/epx-certification-samples-11-evidence-matrix.md)

## Uploaded log file
- Source file: docs/epx-certification-samples-11.txt

## BRIC / AUTH_GUID needed for next payment
- ORIG_AUTH_GUID in request form (masked): docs/epx-certification-samples-11.txt#L72
- ORIG_AUTH_GUID in rawFields (unmasked): docs/epx-certification-samples-11.txt#L99
- ORIG_AUTH_GUID in URL-encoded raw payload: docs/epx-certification-samples-11.txt#L115
- AUTH_GUID returned by EPX response fields: docs/epx-certification-samples-11.txt#L135
- hasAuthGuid confirmation in app response: docs/epx-certification-samples-11.txt#L194
- Request/response echo in epxTransaction block:
  - Request ORIG_AUTH_GUID: docs/epx-certification-samples-11.txt#L219
  - Response AUTH_GUID: docs/epx-certification-samples-11.txt#L246

## Scheduler-relevant values visible in the log sample
- Environment = sandbox: docs/epx-certification-samples-11.txt#L50
- Payment method type = ACH: docs/epx-certification-samples-11.txt#L159
- TRAN_TYPE = CKC2 recurring ACH type: docs/epx-certification-samples-11.txt#L66
- CARD_ENT_METH = X (MIT/server-post style): docs/epx-certification-samples-11.txt#L70
- STD_ENTRY_CLASS = WEB (ACH class): docs/epx-certification-samples-11.txt#L77
- BATCH_ID used for settlement grouping: docs/epx-certification-samples-11.txt#L68
- TRAN_NBR used as transaction number: docs/epx-certification-samples-11.txt#L69

## Where this data is stored and consumed in code
- Token persistence into payment_tokens.bric_token (encrypted): server/storage.ts#L4571
- Due-subscription query pulls bric_token for scheduler: server/storage.ts#L4459
- Scheduler decrypts token for recurring charge (ORIG_AUTH_GUID source): server/services/recurring-billing-scheduler.ts#L374
- Scheduler due query call: server/services/recurring-billing-scheduler.ts#L294
- Scheduler startup gate/interval: server/services/recurring-billing-scheduler.ts#L595
- Server-post includes ORIG_AUTH_GUID field to EPX: server/services/epx-payment-service.ts#L776
- Runtime scheduler preview endpoint: server/routes/epx-certification.ts#L610

## End-to-end token trace (what EPX will look for)
- Incoming recurring reference token in your sample (ORIG_AUTH_GUID): [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L99)
- EPX response token returned (AUTH_GUID): [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L135)
- App persists token (encrypted) to payment_tokens.bric_token: [server/storage.ts](server/storage.ts#L4571)
- Scheduler loads due subscriptions with bric_token: [server/storage.ts](server/storage.ts#L4459)
- Scheduler decrypts token before recurring charge request: [server/services/recurring-billing-scheduler.ts](server/services/recurring-billing-scheduler.ts#L374)
- Recurring server-post sends token as ORIG_AUTH_GUID to EPX: [server/services/epx-payment-service.ts](server/services/epx-payment-service.ts#L776)
