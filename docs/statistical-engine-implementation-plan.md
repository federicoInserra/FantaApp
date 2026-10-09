# Statistical engine implementation plan

## Objective and workflow

Add a separate Monte Carlo recommendation method named **Statistical engine** to the existing selector containing DeepSeek and Kimi. Preserve both current AI methods, their default selection, requests, follow-up conversations and saved legacy results. Implement with a GPT-6.1 Sol subagent at low effort, then review with a fresh GPT-6.1 Sol subagent at medium effort. The parent agent reads the review, resolves findings, verifies the result and recaps before any Git push. No push or production deployment in this implementation turn.

## 1. Add a separate recommendation-method identity

- Keep AI provider metadata and the backend provider allowlist separate from the new engine identity. Do not register the engine as a Fireworks model.
- Add the exact label `Statistical engine` to the existing selector; keep DeepSeek as default for existing/new AI workflows.
- Branch execution, readiness, progress and cost messaging only for engine selections. Engine generation needs current research but no Fireworks key or paid API request.
- Existing AI recommendations continue offering the same follow-up chat. Engine recommendations have generated statistical explanations and do not silently start AI chat.

## 2. Implement supported league rules

- Use a validated, explicit engine rule profile for allowed classic formations, scoring weights, maximum substitutions, formation-change behavior and defensive modifier eligibility/thresholds.
- Initialize from current default rules; support clearly recognized edits where possible. Unsupported or ambiguous scoring/substitution rules must be reported, not silently replaced by defaults.
- Distinguish presentation instructions and soft formation preferences from hard rules.
- Scope the first engine to Classic roles. Existing Mantra catalog metadata remains unchanged.

## 3. Extend data refresh conservatively

- Reuse current Fantacalcio/Understat/calendar collection. Retain relevant available club match histories and fixture identities as bounded, versioned engine data where useful.
- Keep engine-only enrichment out of legacy AI prompts when feasible, and preserve existing research validation, persistence limits and old saved snapshots.
- Validate dates, seasons, identity and numeric values. Missing observations remain missing; fetched timestamps do not prove that a source has published the latest result.
- Do not assume additional paid data endpoints, credentials or licenses. Where individual match histories or calibrated probabilities are absent, use documented conservative priors and expose that limitation.
- Refresh remains user-triggered through Aggiorna dati, using whatever post-match data sources have published. No background scheduler or live subscription is introduced.

## 4. Build conservative player forecasts

- Estimate participation/rating scenarios, pure ratings, attacking contributions and maluses from available evidence.
- Shrink small samples toward documented role/league priors. Separate editorial starting forecasts from actual rating probabilities; do not present inferred probabilities as source facts.
- Avoid adding historical fantasy averages to independently forecast bonuses. Handle missing data and transfers explicitly.
- Sample uncertainty without claiming the model has been calibrated or validated against historical matchday outcomes.

## 5. Implement Monte Carlo comparison

- Generate reproducible seeded matchday scenarios and reuse the same player outcomes across all candidates.
- Model shared fixture outcomes consistently: goals conceded and clean sheets, scoring/assist events where supported, and coherent participation assumptions.
- Evaluate complete valid formations, plausible starter alternatives and bench priorities with bounded candidate search. Apply substitutions and modifiers inside each simulation, respecting the substitution cap and supported formation rules.
- Distinguish best evaluated candidate from a mathematically proven global optimum. Verify pruning/search behavior against tractable exhaustive examples.
- Use a worker or cooperative chunks so the UI remains responsive and cancellation really stops work. Benchmark a realistic roster and impose sensible bounds.
- Engine recommendations are pre-matchday advice. Do not use already-completed results to retrospectively select an unlocked lineup, or label predictions as actionable after the relevant deadline.

## 6. Present an engine-specific recommendation

- Reuse the current pitch, bench and forecast presentation, with the correct engine label instead of AI provenance.
- Show expected points, simulation-derived range/percentiles, relevant threshold estimates when supported, nearest alternatives and decisive comparisons.
- Explain differences using computed evidence and templates; no LLM call is required. Small simulated differences remain uncertain.
- Identify assumptions, data coverage, research time, engine version and simulation parameters. Engine usage is no paid AI request; distinguish compute from provider-token cost.

## 7. Preserve persistence and freshness behavior

- Store a bounded, validated engine result through the existing recommendation save path; retain roster/rules fingerprint and research identity conflict checks.
- Saved engine recommendations must survive database round trips, reloads and cross-device access. Switching selector options must not alter a saved result until generation succeeds.
- New research, rule/roster changes or a different matchday invalidate the engine result as they do current AI results. Failures and cancellation preserve previous saved recommendations.
- Keep legacy recommendation compatibility and existing AI follow-up behavior intact. Prevent engine identity from reaching the provider proxy.

## 8. Verify and review

- Meaningful tests for rule handling, substitutions, defensive modifier nonlinearity, shared events, reproducibility, missing data, invalid inputs, incomplete rosters and search bounds.
- Integration/regression tests for selector routing, no-key engine availability, no provider calls, saved engine results, stale context, source enrichment and unchanged DeepSeek/Kimi behavior.
- Run npm test and npm run build; bump and verify service-worker shell assets.
- Benchmark representative roster performance and cancellation. Where browser tools are available, check selector and a local demo database without production writes or paid inference.
- Fresh independent medium-effort reviewer inspects bugs, model consistency, performance and regressions after implementation. Address findings and rerun affected checks.
- Parent summarizes changes, tests, review fixes, limitations and Git status before any push.
