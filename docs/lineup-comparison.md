# Saved lineups and automatic results

Each new structured recommendation is archived in `fantaapp_lineup_history`, independently of the team's latest recommendation. Its key is `(team_id, season, matchday, method)`; DeepSeek, Kimi, Statistical engine, ChatGPT and Federico have separate entries. Regeneration or manual saving replaces only the matching entry and clears its previous actual result. Seasons and matchdays remain separate. Removing a team removes its archive.

The archive captures the roster, Fantacalcio player identities, ordered bench, rules, generation timestamp, round deadline and full recommendation. Workspace saves and archival updates are a single PostgreSQL statement, with the existing revision check. Ordinary edits and follow-up questions do not replace archived choices. Actual-score updates are guarded by the recommendation ID and source retrieval time, preventing stale requests from attaching results to regenerated choices.

The latest compatible existing recommendation is migrated on initialization. Earlier overwritten suggestions cannot be recovered. Stale recommendations whose original roster/research cannot be established are not reconstructed from the current team.

## Manual choices

ChatGPT and Federico use an editable pitch with all supported modules, role-filtered available roster players and an ordered bench. Selecting an already assigned player swaps the positions; empty bench slots are omitted when saved. Module changes preserve choices, promote the first reserves for added positions and place surplus starters at the front of the bench. Selecting any of the five methods queries its own archived choice for the current season and matchday; a missing entry shows an empty pitch. Save manual edits before switching, as selecting a method reloads its database entry. Saving is explicit and uses the same guarded database/archive operation as generated recommendations, including the selected module, starters, bench and optional notes.

Method selection is read-only: it does not replace the team's latest recommendation or module in the database. The selected archive's module, roster, starters, bench, explanation and player predictions are displayed together. Saved AI choices remain visible with a warning when research expires or the current roster changes. Loading failures show a retry action and an empty pitch; cancelled or superseded requests cannot update the current selection. Module preview changes are local and reset on method selection. Model follow-ups remain available for the team's latest compatible recommendation; other archived suggestions are readable without sending a question against a different method's result.

ChatGPT's Copy prompt button uses the same shared request builder as DeepSeek and Kimi, joining its exact instructions and input strings. It makes no model request. A selectable text preview provides a fallback when clipboard access fails. The user pastes this prompt into their own chat, then enters the resulting lineup. If the research or roster changes after copying, the prompt must be copied again before saving. Editing works without fresh research; copying and saving require the same fresh verified season/matchday context used by the other methods. Manual entries contain no invented forecast or app model cost and cannot use model follow-up questions.

## Results

`GET /api/lineups?teamId=…` returns compact history summaries. Adding `season` and `matchday` returns that round's full entries. `POST /api/lineups` with those three fields collects actual matchday results and saves calculated scores. The Confronto page does this automatically when opened; Aggiorna risultati also rechecks results. There is no background scheduler. A warm function caches fetched votes for five minutes.

The collector reads the public Fantacalcio matchday page for the exact season/round, with the Redazione Fantacalcio provider. It validates selected season, round, canonical URL, ten completed matches and twenty populated club tables. It reads pure votes, published classic fantasy votes and goalkeeper conceded goals. Coaches and the provider's no-vote sentinel codes (55/56) are excluded. It does not request protected spreadsheet downloads or use season averages as actual scores.

Scoring uses published fantasy votes, adds the saved profile's goalkeeper clean-sheet bonus, then applies same-role substitutions in P/D/C/A order (with the saved cap and bench priorities) and the defensive modifier from pure votes. The supported scoring profile is the existing Classic default, allowing 0–5 substitutions and custom league metadata/preferences. Other hard-rule profiles are marked unsupported; this does not prevent storing their AI suggestions. These results use Redazione Fantacalcio votes for both list sources, not a separate FantaMaster editorial vote provider.

Unknown identities/votes that affect a starter or its priority replacement stay pending. Unknown unused reserves do not block a score. Stable provider IDs allow absence from a complete vote page to mean no vote; ambiguous names, special S.V. event cases and duplicate real-player identities are not guessed.

A winner or tie is shown among the saved methods only when at least two methods have complete results, identical hard rules and verified recommendations generated before the round deadline. Late regenerations are saved as requested but excluded from method evaluation.

## Validation

147 automated tests pass, including database isolation/overwrites across all five methods, atomic rollback, revision conflicts, migration, in-flight generation/scoring races, manual role filtering/swaps/module changes, exact prompt copying, method switching, stale/superseded archive requests, empty pitches, substitutions, modifiers, published-vote parsing and comparison ties/exclusions. Browser verification used a disposable database and synthetic results for all five methods, checking explicit saves, reloads, independent manual choices and bench priorities; no paid model requests or production team changes were used for testing. The parser was also checked against a real public matchday page.
