# EPX Certification Evidence Matrix

Use this as the reviewer cover sheet when sending the sample file to EPX.

## Primary sample file
- [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt)

## Evidence checklist

1. Initial ACH request exists
- Evidence: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L6)
- Endpoint: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L10)
- Request status envelope (202 submitted): [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L29)

2. Server-post MIT request exists
- Evidence: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L51)
- Server-post endpoint/url: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L55)

3. Token for next recurring payment is present in request
- ORIG_AUTH_GUID in form body: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L72)
- ORIG_AUTH_GUID in rawFields (full value): [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L99)
- ORIG_AUTH_GUID in encoded raw payload: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L115)

4. Processor returns new/linked AUTH_GUID
- AUTH_GUID in parsed EPX fields: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L135)
- AUTH_GUID in raw XML response: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L123)

5. ACH recurring transaction setup fields are present
- TRAN_TYPE CKC2: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L66)
- CARD_ENT_METH X: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L70)
- STD_ENTRY_CLASS WEB: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L77)
- ACCOUNT_TYPE C: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L76)

6. Settlement/trace identifiers are present
- BATCH_ID: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L68)
- TRAN_NBR: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L69)
- AUTH_CODE: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L137)
- AUTH_RESP (approval code): [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L136)

7. App confirms approved result + token presence
- Purpose ach-initial-approved: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L171)
- hasAuthGuid true: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L194)

8. Environment + payment method context are visible
- Environment sandbox: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L50)
- paymentMethodType ACH: [docs/epx-certification-samples-11.txt](docs/epx-certification-samples-11.txt#L159)

## Scheduler readiness and token usage path in application

1. Token persistence location
- Upsert writes encrypted token into payment_tokens.bric_token:
  [server/storage.ts](server/storage.ts#L4571)

2. Scheduler due-subscription source
- Due query selects payment_tokens.bric_token:
  [server/storage.ts](server/storage.ts#L4459)

3. Scheduler token usage
- Scheduler decrypts bricToken before recurring call:
  [server/services/recurring-billing-scheduler.ts](server/services/recurring-billing-scheduler.ts#L374)

4. Scheduler recurring request construction
- ORIG_AUTH_GUID assigned into server-post request:
  [server/services/epx-payment-service.ts](server/services/epx-payment-service.ts#L776)

5. Scheduler runtime visibility
- Preview endpoint to show due subscriptions and runtime ACH gating:
  [server/routes/epx-certification.ts](server/routes/epx-certification.ts#L610)

## Optional companion file for quick review
- [docs/epx-certification-samples-11-highlights.md](docs/epx-certification-samples-11-highlights.md)
