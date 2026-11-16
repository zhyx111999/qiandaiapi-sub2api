# NovelAI native compatibility release — 2026-11-16

## Release identity

- Repository: `ChiYo-Tobi/qiandaiapi-sub2api` (user-designated fork).
- Branch: `fix/novelai-client-compat-20261116`.
- Runtime commit: `a28e7f0bcec847d2bf02157edd8bf1dc1dc34627`.
- Image: `qiandaiapi-sub2api:a28e7f0-native-compat`.
- Image manifest-list digest: `sha256:cf02208465ac822fdfca1b5c1de47078d9f899680bf3516a2dae13dea041c072`.
- Linux binary SHA-256: `20110e2abdc6f2d13f162a5d85b8074a060748c6e5f2fae0d721913a754c760e`.
- Health check: passed after deployment.
- Previous image: `qiandaiapi-sub2api:469d94cbc`.
- Backup: `/opt/qiandaiapi/backups/before-native-compat-a28e7f0-20261116/` (database dump, app data, compose and environment files).

The original snapshot and fork baseline were compared across 8,710 tracked files with no content differences. Credentials were supplied only at runtime; task credentials were checked against the changed files and none were present.

## Delivered

- Authenticated fixed subscription metadata at root and `/v1` aliases: Opus, 10000 Anlas and 100% usage.
- Upscale and encode-vibe endpoint pricing: $0.01/call and $0.02/image.
- Director Tools capability routing with calibrated active-Opus Anlas × $0.01 pricing, including explicit zero tiers.
- Free GET tag suggestions, raw query/content-type passthrough, short deadline and no generation-slot acquisition.
- Native body/error passthrough, no automatic retry or redirects, mandatory successful usage settlement.
- Frozen per-request base multiplier shared by admission and settlement; model/channel image/token prices cannot replace utility quotes.
- Exact subscription SPA bypass, preserved model policies and Composite/multi-group routing.
- Distributed model-plaza columns, mobile table scrolling and static bilingual add-on pricing.

Generation pixel tiers, reference-image pricing, seven-model discovery, nai-station and annotate-image behavior were not changed.

## Approved adjustments to the original brief

1. Director's original $0.005–$0.02 range was incorrect. The user approved calibrated costs, including free tiers and higher background-removal costs. See [calibration](novelai-native-pricing-calibration-20261116.md).
2. The production group has an explicit seven-model allowlist. The user chose to keep it: bogus model names on upscale/encode-vibe return local 404 without charge. Upstream 400 passthrough was instead validated with allowed models and a missing image part. Do not disable the allowlist merely to match the earlier malformed-model probe expectation.

## Live acceptance

| Check | Result |
|---|---|
| Subscription root + `/v1` | 200 exact fixed JSON; missing key 401 |
| Tags root + `/v1`, V4.5 and V5 queries | 200, nonempty tags, `text/plain; charset=utf-8`, no bill |
| Upscale | 200; total/actual cost $0.01 (usage 44178) |
| Encode-vibe | 200 binary; total/actual cost $0.02 (usage 44181) |
| Director five free tools at 64×64 | 200; five explicit zero-cost records |
| Background removal at 64×64 | 200; $0.08 (usage 44183) |
| Five Director tools at 1536×1024 | 200; $0.30 each (usage 44188–44192) |
| Invalid Director action | Original upstream 400; no bill |
| Allowed-model missing-image upscale/encode | Original upstream 400; no bill |
| Generation and streaming | 200; existing $0.001 rate retained (usage 44194/44195) |
| Models | Response SHA-256 unchanged; seven entries |
| Annotate-image | Still 404 |
| Error/free metadata probe billing | Zero records |

The main successful batch totalled $1.612. A separate LA encode-vibe balance reconciliation produced one $0.02 usage entry (44215), with an exact $0.02 balance decrease. One preceding local reconciliation attempt timed out without a bill; it was not treated as successful.

## Validation and limitations

Passed:

- All new Native service/handler/routing/auth/embedded-SPA targeted tests on Windows.
- Linux-container targeted tests of the cross-compiled core packages; the final handler binary was revalidated after the last ownership-context correction.
- Full middleware/routes unit suites.
- Incremental `golangci-lint` against the release baseline, including unit/embed tags.
- Frontend Model Plaza/i18n tests: 70 tests in 9 files.
- Frontend typecheck, changed-file ESLint, production build.
- Browser layout checks at 1920, 1280 and 390 pixels; mobile table scrolling and absence of whole-page horizontal overflow.

**Full suites are not green and must not be represented as passed:**

- Frontend full run: 6241 passed, 53 skipped, 5 failed. Two Windows CMD timeout cases passed on isolated rerun. Three unchanged auth-source-default tests expect a platform list omitting the already-existing NovelAI platform.
- Windows `go test ./...`: POSIX permission/symlink/shell-kernel tests fail, plus existing assertions. `TestAllPlatformsIncludesEveryConcretePlatform` and `TestQuality5xxDoesNotSkipRecentlyCompletedPlan` were reproduced against the untouched baseline; an isolated timing-sensitive snapshot test passed on rerun.
- LA full-source test attempts could not compile the large ent package within 1.3/1.8GB container limits. Neither attempt is a passing test run.
- A subsequent cross-compiled Linux core-package full run was also not green: incomplete fixture transfer affected credential-operation tests, service/handler runs were constrained by container resources, and an existing embedded `/v3/other` bypass expectation failed. The targeted Linux suite is the verified Linux acceptance result, not a substitute claim of full-suite success.

Client UI acceptance remains manual: login panel, Vibe, upscale, Director and autocomplete. The static Director schedule assumes the deployment's active Opus upstream pool; changed entitlement or upstream tariffs require recalibration.

## Build and rollback

The LA host has 4GB RAM. After isolated source compilation exceeded its memory budget, the release used the installed Go 1.27.4 toolchain locally with `GOOS=linux GOARCH=amd64 CGO_ENABLED=0`, `-tags embed`, `-trimpath`, and release version/commit/date linker fields. Frontend assets came from the successful frozen-lockfile build. The binary hash was verified after SSH transfer; LA then built a new image on the existing runtime base, replacing only `/app/sub2api` and recording revision labels. No runtime dependency change was made.

Rollback only the app image (no schema migration was introduced): restore `QIANDAI_IMAGE=qiandaiapi-sub2api:469d94cbc` in `/opt/qiandaiapi/image.env`, then run the existing compose command with `.env` and `image.env` and `up -d --no-deps qiandaiapi-app`. Do not restore the database for a routine image rollback, as that would discard subsequent live usage.
