# NovelAI native compatibility and pricing calibration — 2026-11-16

## Scope and decision

This change adds authenticated native subscription metadata, upscale, Director Tools and tag suggestions to sub2api, and charges encode-vibe. The upstream remains nai-station; sub2api never sends production requests directly to NovelAI. Model discovery, generation pixel tiers and reference-image pricing are unchanged. Annotate-image remains unsupported.

All prices are USD. Upscale is $0.01 per successful call; encode-vibe is $0.02 per successful call (one image). Tag suggestions and synthetic subscription metadata do not create usage charges.

The original task's Director estimate of 0.5–2 Anlas / $0.005–$0.02 was disproved by live measurements. The user explicitly approved replacing that range with calibrated Anlas × $0.01, including zero-price tiers, on 2026-11-16. Do not restore the obsolete range in the UI.

## Method and coverage

Authorized tests ran serially from the LA host against the official image API. The calibration script took an actual `/user/subscription` snapshot immediately before and after each operation, summing `fixedTrainingStepsLeft` and `purchasedTrainingSteps`. It also captured tier, active state, usage percentage, status, response size and SHA-256. The gateway's synthetic subscription response was **not** used for calibration. Two available credentials both reported active Opus (tier 3).

Requests used deterministic, locally generated PNGs and the client's multipart layout: image part plus `request` JSON part. Successful Director responses used `binary/octet-stream`; the gateway must preserve the upstream Content-Type rather than force a ZIP MIME type. No credentials or image outputs are included here.

### Measured Director costs

| Tool / condition | Input dimensions | Anlas delta | Base USD |
|---|---:|---:|---:|
| emotion, colorize, declutter, lineart, sketch; active Opus | 512×512 | 0 each | $0 |
| emotion, defry=5; active Opus | 1024×1024 | 0 | $0 |
| bg-removal | 64×64 | 8 | $0.08 |
| bg-removal | 256×256 | 11 | $0.11 |
| bg-removal | 512×512 | 20 | $0.20 |
| bg-removal | 1024×1024 | 65 | $0.65 |
| bg-removal | 1536×1024 | 95 | $0.95 |
| emotion, defry=0 and 5 | 1536×1024 | 30 each | $0.30 |
| colorize, defry=0 and 5 | 1536×1024 | 30 each | $0.30 |
| declutter, lineart, sketch | 1536×1024 | 30 each | $0.30 |
| emotion, defry=3 | 1088×1024 | 22 | $0.22 |
| emotion, trial=false; defry=3 | 1536×1024 | 30 | $0.30 |
| emotion, trial=false or omitted; defry=3 | 512×512 | 0 each | $0 |
| bg-removal, trial=false | 512×512 | 20 | $0.20 |

All rows above returned HTTP 200. Default trial was `use_new_shared_trial=true` unless specified. Two additional background-removal probes with declared dimensions different from PNG dimensions returned HTTP 500 and consumed zero Anlas; these must not create gateway charges.

### Calibrated formula

For the deployment's active-Opus pool, with raw request area `A = width × height`:

```text
C = ceil(A × (2.951823174884865e-6 + 28 × 5.753298233447344e-7))
bg-removal Anlas = 3 × C + 5
other five tools Anlas = 0 if A ≤ 1024 × 1024, otherwise C
base USD = Anlas × 0.01
```

There is **no** client-side 1MP upscaling normalization and no 65,536-pixel / 2-Anlas minimum in this measured direct-API formula: the 64×64 background-removal result (8 Anlas) distinguishes these cases. `defry` and the trial flag did not change the measured paid costs. Do not advertise a defry price multiplier based on unverified client estimates.

This is a calibrated price schedule, **not** live per-request upstream balance metering. Its free tiers assume active Opus upstream credentials. Non-Opus, expired accounts, trial-only credentials, every intermediate defry value, arbitrary dimensions and future upstream price changes have not all been verified. Recalibrate before changing the pool's entitlement profile or supported tools. Unknown tool types may return their original upstream validation error; an unexpected successful response from an unpriced tool must not be delivered as a free operation.

## Billing and transport invariants

- Preserve original JSON/multipart body bytes and Content-Type, including boundary.
- Retain normal authentication, group policy and image permissions for image tools.
- Select model-less tools by NovelAI capability without adding synthetic models to `/v1/models`.
- A server-side endpoint quote takes precedence over image/token model price cards. Explicit zero is not an absent quote.
- Freeze the user/group/account base multiplier before reserving the endpoint quote; settlement and the usage log use that same snapshot even if settings or cached rates change during the request. Existing generation/reference pricing is not involved; peak token and image-tier overrides do not change a native tool's base price.
- Successful tool calls use the existing mandatory usage-record and balance-settlement path. Non-2xx, relay failure and rejected unpriced success do not settle.
- Native tool requests are not automatically retried, avoiding duplicate upstream spending.
- Tag suggestions use GET, preserve raw query, response status/body/Content-Type, have a sub-5-second handler deadline, and do not acquire generation slots or create a usage bill.
- Only the exact `/user/subscription` root path is newly exempted from the SPA fallback; unrelated unknown pages retain their prior behavior.

## References

- Official Director Tools documentation: https://docs.novelai.net/en/image/directortools — tool behavior, not a numeric price table.
- Official subscription documentation: https://docs.novelai.net/en/subscription — subscription and purchased Anlas are distinct balance sources.
- Client/SDK estimates were useful hypotheses but disagreed on size normalization. The deployed schedule is based on the measurements above, not on treating those estimates as a billing guarantee.

Post-deployment endpoint and database billing evidence is recorded separately in the compatibility report after release verification.
