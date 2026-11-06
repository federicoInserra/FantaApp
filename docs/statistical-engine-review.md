# Statistical engine independent review

Reviewed by a fresh GPT-6.1 Sol agent at medium effort after implementation by a GPT-6.1 Sol agent at low effort. Review used local fixtures, with no paid inference or production database writes.

## Findings requiring correction

1. **P1 — Availability labels:** recognize the actual collector strings `Squalifica:` and `Infortunio:`. Suspensions must not become likely participation because of a stale starter label.
2. **P2 — Candidate coverage:** a per-formation cap consumed by goalkeeper, defender and midfield alternatives omitted all attacker alternatives on a normal 25-player roster. Balance the search budget across roles before adding bench permutations.
3. **P2 — Full-round deadline:** roster fixtures cannot establish the matchday deadline when the first game involves unowned clubs. Retain and validate the complete official round and its earliest kickoff.
4. **P2 — Goalkeeper coherence:** independently sampled same-club keepers could both receive all conceded goals. Use a joint conservative keeper scenario with coherent event attribution.
5. **P2 — Score precision:** independently rounded slot components could disagree with the simulated mean. Preserve component precision and round only for presentation.
6. **P2 — Saved-result validation:** an engine recommendation without a forecast passed validation and crashed rendering. Require its forecast.
7. **P2 — Cancellation cost messaging:** cancelling an AI follow-up after selecting the engine incorrectly reported no credits consumed. Use the executed operation for billing messaging.

The initial review's 109 tests and build passed, illustrating why the focused reproductions above were necessary. Documented uncalibrated priors and bounded search remain limitations rather than proof of forecast accuracy.

## Resolution

All seven original findings were corrected. Follow-up review caught two additional issues: proportional goalkeeper allocation reduced the preferred keeper's chance merely because a backup was owned, and saved metadata could contradict the forecast total. The final implementation preserves the preferred keeper's chance, applies conditional backup probabilities before sorting and explanation, and rejects contradictory saved means and percentile ranges.

The independent reviewer confirmed all original and follow-up findings resolved, with no further actionable defects in the focused final review. The goalkeeper reproduction yielded 90.01% preferred keeper participation, 5.62% backup participation, and no simultaneous ratings. A seeded zero-substitution regression verifies that adding a backup leaves the preferred keeper's ratings and points unchanged.

Parent verification: **115 tests pass**, static build succeeds, and `git diff --check` passes. A synthetic 25-player benchmark evaluated 136 candidates over 1,000 scenarios in about 0.25 seconds; cancellation responded in about 1 ms. Browser checks used a disposable local database and verified selector routing, generation, saved-result reload, and switching to an AI method without replacing the saved engine result. The service-worker shell cache is v39 and includes the engine module.

Nothing is committed, pushed or deployed as part of this workflow. Forecast accuracy has not been validated against historical matchday outcomes; this is a conservative Classic v1 with bounded search and documented statistical assumptions. Older research requires one fresh **Aggiorna dati** call to acquire the full-round deadline.
