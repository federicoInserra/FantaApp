import {collectMatchdayVotes} from './matchday-votes.mjs';
import {collectFantamasterVotes} from './fantamaster-votes.mjs';
import {voteListSource} from '../src/vote-sources.mjs';
export function collectTeamMatchdayVotes(season,matchday,options={}) {
  return (voteListSource(options.listSource)==='fantamaster'?collectFantamasterVotes:collectMatchdayVotes)(season,matchday,options);
}
