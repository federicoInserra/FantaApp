import {MANUAL_METHODS} from './recommendation-methods.mjs';
export const COMPARISON_METHODS=[{id:'deepseek',label:'DeepSeek'},{id:'kimi',label:'Kimi'},{id:'statistical-engine',label:'Statistical engine'},...MANUAL_METHODS];
const complete=item=>item.actual_result?.status==='complete'&&Number.isFinite(item.actual_result.total);
export function comparisonWinner(items) {
  if(items.length<2||items.some(i=>!complete(i)))return [];
  const rulesFor=i=>(i.record?.rules??i.rules??[]).slice(3,14);
  const rules=JSON.stringify(rulesFor(items[0]));
  if(items.some(i=>JSON.stringify(rulesFor(i))!==rules))return [];
  if(items.some(i=>i.actual_result.checkedAt!==items[0].actual_result.checkedAt||i.actual_result.provider!==items[0].actual_result.provider||i.actual_result.sourceUrl!==items[0].actual_result.sourceUrl))return [];
  const best=Math.max(...items.map(i=>i.actual_result.total));
  return items.filter(i=>Math.abs(i.actual_result.total-best)<.001).map(i=>i.method);
}
// Derive rankings from the saved results: refreshes, corrected votes and replacements
// update the standings without accumulating the same matchday more than once.
export function comparisonRankings(history) {
  const rows=new Map(COMPARISON_METHODS.map(({id,label})=>[id,{method:id,label,total:0,scored:0,wins:0,compared:0}])),rounds=new Map();
  for(const item of history){
    const row=rows.get(item.method);if(!row)continue;
    if(complete(item)){row.total+=item.actual_result.total;row.scored++;}
    const key=`${item.season}:${item.matchday}`;
    if(!rounds.has(key))rounds.set(key,[]);
    rounds.get(key).push(item);
  }
  for(const items of rounds.values()){
    const winners=comparisonWinner(items);if(!winners.length)continue;
    for(const item of items){const row=rows.get(item.method);row.compared++;if(winners.includes(item.method))row.wins++;}
  }
  return [...rows.values()].map(row=>({...row,total:Math.round(row.total*100)/100}));
}
