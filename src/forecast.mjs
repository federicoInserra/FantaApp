const invalid=()=>{throw new Error('Previsione AI non valida. La proposta precedente è stata conservata. Riprova l’analisi.');};
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const number=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
export const rounded=value=>Math.round((value+Number.EPSILON)*10)/10;
export const predictedPoints=player=>rounded(player.vote+player.bonus-player.malus);
export function forecastTotals(forecast){
  const sum=field=>rounded(forecast.players.reduce((total,player)=>total+player[field],0));
  return {vote:sum('vote'),bonus:sum('bonus'),malus:sum('malus'),modifier:forecast.modifier,expected:rounded(forecast.players.reduce((total,player)=>total+player.vote+player.bonus-player.malus,0)+forecast.modifier)};
}
// Predictions are stored separately from sourced statistics; totals are derived, never trusted.
export function storedForecast(data,lineup){
  if(!data||!number(data.low,-100,300)||!number(data.high,-100,300)||!number(data.modifier,-30,30)||!text(data.modifierReason,1500)||!text(data.assumptions,3000)||!Array.isArray(data.players)||data.players.length!==lineup.starters.length)invalid();
  const ids=new Set();
  const players=data.players.map(player=>{
    if(!lineup.starters.includes(player?.id)||ids.has(player.id)||!number(player.vote,0,10)||!number(player.bonus,0,30)||!number(player.malus,0,30)||!text(player.reason,1200))invalid();
    ids.add(player.id);
    return {id:player.id,vote:rounded(player.vote),bonus:rounded(player.bonus),malus:rounded(player.malus),reason:player.reason.trim()};
  });
  const result={low:rounded(data.low),high:rounded(data.high),modifier:rounded(data.modifier),modifierReason:data.modifierReason.trim(),assumptions:data.assumptions.trim(),players};
  const {expected}=forecastTotals(result);
  if(result.low>expected||result.high<expected||result.low>result.high)invalid();
  return result;
}
