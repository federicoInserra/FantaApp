import {handleTeams} from '../server/teams-api.mjs';
export default {fetch:request=>handleTeams(request)};
