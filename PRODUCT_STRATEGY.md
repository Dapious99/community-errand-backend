# Product Strategy Notes

Living record of the strategic review done on 2026-08-08, plus the decisions
made off the back of it. Update this file rather than losing the reasoning
in chat history — it's the "why" behind several non-obvious product rules
implemented in the code (ban ladders, KYC tiering, fee tiers, etc).

## What this product is

A Nigeria-first errand marketplace (TaskRabbit/Gigwalk shape) with unusually
mature trust infrastructure for its stage: mandatory NIN/BVN KYC gated behind
admin approval before picking work, an escalating ban system for flaky
runners, a dispute/concern flow, a single wallet ledger threading errand
payments, boosts, Pro subscriptions, referrals, and airtime/bills together,
and a two-way WhatsApp channel (account management + errand posting/browsing/
accepting) with wallet/bills still stubbed there on purpose.

## The four-lens read

### Marketer
- "Run errands from WhatsApp, no app required" is a genuinely differentiated
  hook — WhatsApp is already the default commerce interface in this market.
  That's the headline, not a footnote, once the WhatsApp leg is further along.
- Trust is the actual product, not the errands. NIN-verified runners +
  admin-reviewed KYC + wallet escrow + dispute resolution beats most local
  competitors on safety. Lead with that.
- The referral rule ("bonus depends on whether you were Pro *at the moment*
  they signed up, even though it pays out later") is too subtle for mass-market
  messaging — it already generates support questions. Keep the nuance out of
  marketing copy; just say "you'll be notified if you qualify."

### User (both sides)
- Runner onboarding had a long dead zone between "excited to earn" and
  "actually earning" — sign up, submit NIN, wait for a human to review, only
  then pick a first errand. **Addressed below** (light-KYC tier for low-value
  errands).
- Requesters previously faced zero consequence for serial cancellations while
  runners had a strict 3-strike ban ladder. **Addressed below** (mirrored
  ban ladder on the requester/posting side).
- Religion and marital status are collected on profile. Decision: **kept**,
  explicitly for demographic/analytics purposes — not tied to any matching
  feature today. Revisit if that framing changes.

### Grant-giver
- Real financial-inclusion and youth-employment story already exists in the
  data model: unbanked/underbanked users get a wallet, verified identity, and
  an earnings history. That's the receipts a funder wants, not just a claim.
- Still missing: visible analytics/impact instrumentation (cohort retention,
  GMV per runner, time-to-first-payout) and an explicit NDPA/data-retention
  policy given NIN/BVN/bank-detail collection. Not addressed in this pass —
  needs a decision on tooling/policy, not just code.

### Business developer
- Monetization is already diversified (platform fee, boost fee, Pro
  subscription, bills margin, withdrawal fee) but every lever pulled on the
  *requester* side or was flat-fee. Nothing rewarded the supply side or
  flexed with demand. **Addressed below** (surge boost pricing, Pro-runner
  fee discount, boosted-errand priority window).
- B2B (shops/pharmacies wanting a standing runner pool) sits on infrastructure
  that already exists (wallet, KYC'd runners, dispute handling) — mostly a
  packaging exercise, not new engineering. **Addressed below** (business
  credit packages).
- Multi-country config scaffolding (currency/gateway/pricing per country) is
  good engineering that's currently unused (one country, one gateway). Not
  worth more investment until a second country is an actual near-term plan —
  leave as latent groundwork, don't extend it further for now.

## Decisions made and status

| Item | Status |
|---|---|
| Religion/marital-status fields on profile | **Kept** — demographic/analytics purpose |
| Light-KYC tier: submitted (not yet approved) NIN is enough to pick low-value errands | **Implemented** |
| Full KYC approval still required above the low-value threshold, and always required before withdrawal | **Implemented** (withdrawal gate already existed; threshold gate is new) |
| Requester (or both-role user acting as requester) repeat-cancellation punishment, mirroring the runner ban ladder (72h → 7 days → permanent) | **Implemented** |
| Runner 3-consecutive-failure ban ladder applying to both-role users | **Already implemented** prior to this review — confirmed still correct, no change needed |
| Runner tiers (Bronze/Silver/Gold by completions + rating, with a real perk attached) | **Captured, not built** — worth doing once there's enough completed-errand volume for tiers to mean anything |
| WhatsApp-based support escalation from the concerns/dispute flow | **Captured, not built** — deliberately deferred; WhatsApp leg is staying as-is until its current scope proves out functionally |
| WhatsApp wallet top-up / bills (would unlock WhatsApp as a true no-app-install acquisition channel) | **Captured, not built** — same reason as above |
| Surge/dynamic boost pricing (boost price rises when there are many open errands competing for runner attention) | **Implemented** |
| Boosted errands get a short Pro-priority window (early access), reusing the existing priority-window mechanic | **Implemented** |
| Pro-runner discounted platform fee at payout | **Implemented** |
| B2B "errand credits" packages (pay a lump sum, get a bonus % credited to wallet) for businesses that want a standing errand-posting budget | **Implemented** |
| Multi-country/multi-gateway expansion beyond the existing scaffolding | **Not pursued** — no near-term second country, would be premature investment |
| Impact/analytics instrumentation for grant applications | **Not pursued this pass** — needs a tooling decision (e.g. PostHog/Amplitude) before it's a coding task |
| Documented NDPA/data-retention policy | **Not pursued this pass** — a legal/policy artifact, not code |

## Mechanics reference (for future-me)

- **Ban ladders are symmetric by design.** Runner-side (`consecutiveErrandFailures`
  → `runnerBannedUntil`/`banEscalationLevel`/`permanentlyBannedFromPicking`)
  and requester-side (`consecutivePostingFailures` →
  `requesterBannedUntil`/`postingBanEscalationLevel`/`permanentlyBannedFromPosting`)
  use the identical 72h → 7 days → permanent escalation and the same 3-strike
  threshold, just gating "pick" vs "post" respectively. Both reset to 0 on any
  successful completion on that side. Both have an admin lift-permanent-ban
  endpoint. Keep them in sync if the ladder ever changes.
- **Light-KYC threshold** lives on `CountryConfig.lightKycPriceThreshold`. Below
  it, a `PENDING` (submitted, not yet reviewed) KYC is enough to pick; a
  `REJECTED` or missing KYC is never enough regardless of price; withdrawal
  always requires full `APPROVED` status regardless of errand value.
- **Surge boost pricing** is a deliberately simple, explainable heuristic —
  not a demand-forecasting model. It compares the current count of `OPEN`
  errands against `CountryConfig.surgeThresholdOpenErrands`; above it, boost
  price is multiplied by `CountryConfig.surgeMultiplier`. Revisit the signal
  (e.g. weight by runner supply, not just requester-side volume) once there's
  real traffic to tune against.
- **Pro-runner fee discount**: payout fee is `CountryConfig.proPlatformFeePercent`
  for a currently-Pro runner, `CountryConfig.platformFeePercent` otherwise.
  This replaced the old flat `PLATFORM_FEE_PERCENT` env var entirely.
- **B2B errand credits** are fixed NGN-denominated packages (Nigeria-only, like
  every other hardcoded default in this codebase) defined in
  `payments/business-credit-packages.ts` — a paid amount buys a larger wallet
  credit at a bonus %. Uses the same deposit/webhook-confirmation pipeline as
  a normal top-up, just crediting more than was charged.
