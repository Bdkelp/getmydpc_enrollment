# EPX Certification Reference — My Premier Plans

> Source: **EPX Certification - My Premier Plans (1).pdf**  
> Google Drive file ID: `1oYsR-YqdXEfncOVdB3rcttHNPo-SynCn`  
> Source document classification: EPX Confidential - Security Level 1

## Why this file exists

This repository previously contained the EPX implementation and derivative notes, but not the original certification PDF itself. This reference captures the non-secret certification facts needed by coding agents working on payment and recurring-billing logic without requiring them to infer processor rules from our code.

**Do not treat application schema fields as processor requirements unless they are supported by the EPX certification/source material.**

## Certified transaction types for My Premier Plans

### Credit Card — ECommerce

- `CCE1` — Purchase Auth & Capture — **certified**
- `CCE9` — Return Capture — **certified**

### ACH

- `CKC2` — Checking Account Debit — **certified**

### Card on File

- Recurring Billing — **certified**

## Certified integration methods

- **Server Post (443)** — `https://secure.epx.com`
- **EPX Hosted Checkout** — `https://hosted.epx.com/post.js` (or hosted checkout endpoint as configured by EPX)

## Certification notes relevant to recurring billing

- **2026-01-07** — BRIC Sale and Refund via Server Post added.
- **2026-03-31** — Checking ACH Sale Debit (`CKC2`) added, **including BRIC-based ACH**.

These notes are especially important for recurring-billing maintenance:

- BRIC is a supported recurring credential concept in the MPP certification.
- MPP is certified for BRIC-based Server Post card processing.
- MPP is certified for BRIC-based ACH debit processing using `CKC2`.
- A missing application field such as `original_network_trans_id` must not automatically be treated as a processor requirement when a valid BRIC is present, unless the specific EPX request type requires it.

## Terminology guidance

- **North Tran ID / BRIC**: treat the North portal Tran ID as the BRIC/reusable payment credential for operator repair and credential-restoration purposes.
- **AUTH_CODE**: transaction response/approval metadata; do not require operators to provide it for credential repair unless a documented EPX flow specifically requires it.
- **AUTH_GUID / ORIG_AUTH_GUID**: processor references used by some Server Post flows. They may be valid credential/reference sources, but must not be assumed mandatory when the certified BRIC path applies.
- **Application `payments.transaction_id` / durable `processor_reference`**: transaction tracking/idempotency fields; do not overwrite them with BRIC merely because North labels BRIC as Tran ID.

## Coding-agent rule

Before changing EPX Hosted Checkout, Server Post, recurring card, ACH, BRIC, `AUTH_GUID`, `ORIG_AUTH_GUID`, or credential validation behavior:

1. Read this file.
2. Read the existing EPX service implementation and certification code.
3. Prefer the certified EPX contract over assumptions embedded in our historical schema or guards.
4. Preserve duplicate-charge protection and idempotency.
5. Never log or commit raw payment credentials, keys, or secrets.

## Original source document

The original confidential PDF remains in the authorized Google Drive location above. It should be consulted when exact vendor wording or additional certification details are required. Production credentials, if present in the source PDF, must **not** be copied into this repository.
