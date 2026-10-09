# Saved lineups and automatic results

Each new structured recommendation is archived in `fantaapp_lineup_history`, independently of the team's latest recommendation. Its key is `(team_id, season, matchday, method)`; DeepSeek, Kimi and Statistical engine have separate entries. Regeneration replaces only the matching entry and clears its previous actual result. Seasons and matchdays remain separate. Removing a team removes its archive.

The archive captures the roster, Fantacalcio player identities, ordered bench, rules, generation timestamp, round deadline and full recommendation. Workspace saves and archival updates are a single PostgreSQL statement, with the existing revision check. Ordinary edits and follow-up questions do not replace archived choices. Actual-score updates are guarded by the recommendation ID and source retrieval time, preventing stale requests from attaching results to regenerated choices.

The latest compatible existing recommendation is migrated on initialization. Earlier overwritten suggestions cannot be recovered. Stale recommendations whose original roster/research cannot be established are not reconstructed from the current team.

## Results

`GET /api/lineups?teamId=…` returns compact history summaries. Adding `season` and `matchday` returns that round's full entries. `POST /api/lineups` with those three fields collects actual matchday results and saves calculated scores. The Confronto page does this automatically when opened; Aggiorna risultati also rechecks results. There is no background scheduler. A warm function caches fetched votes for five minutes.

The collector reads the public Fantacalcio matchday page for the exact season/round, with the Redazione Fantacalcio provider. It validates selected season, round, canonical URL, ten completed matches and twenty populated club tables. It reads pure votes, published classic fantasy votes and goalkeeper conceded goals. Coaches and the provider's no-vote sentinel codes (55/56) are excluded. It does not request protected spreadsheet downloads or use season averages as actual scores.

Scoring uses published fantasy votes, adds the saved profile's goalkeeper clean-sheet bonus, then applies same-role substitutions in P/D/C/A order (with the saved cap and bench priorities) and the defensive modifier from pure votes. The supported scoring profile is the existing Classic default, allowing 0–5 substitutions and custom league metadata/preferences. Other hard-rule profiles are marked unsupported; this does not prevent storing their AI suggestions. These results use Redazione Fantacalcio votes for both list sources, not a separate FantaMaster editorial vote provider.

Unknown identities/votes that affect a starter or its priority replacement stay pending. Unknown unused reserves do not block a score. Stable provider IDs allow absence from a complete vote page to mean no vote; ambiguous names, special S.V. event cases and duplicate real-player identities are not guessed.

A winner or tie is shown among the saved methods only when at least two methods have complete results, identical hard rules and verified recommendations generated before the round deadline. Late regenerations are saved as requested but excluded from method evaluation.

## Validation

131 automated tests pass, including database isolation/overwrites, atomic rollback, revision conflicts, migration, in-flight generation/scoring races, substitutions, modifiers, published-vote parsing and comparison ties/exclusions. Browser verification used a disposable database and synthetic results for all three methods; no paid model requests or production team changes were used for testing. The parser was also checked against a real public matchday page.
