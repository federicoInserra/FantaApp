import {handleLineups} from '../server/lineups-api.mjs';
export default {fetch:request=>handleLineups(request)};
