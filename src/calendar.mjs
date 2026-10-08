import {understatServiceURL} from './understat.mjs';
export const CALENDAR_URL='https://www.legaseriea.it/serie-a/calendario-risultati';
export function nextMatchday(calendar,now=new Date()){
  const age=now-Date.parse(calendar?.retrievedAt);
  if(calendar?.version!==1||!Number.isFinite(age)||age< -60000||age>900000||!Array.isArray(calendar.fixtures))throw new Error('Calendario ufficiale non valido o scaduto. Riprova Aggiorna dati.');
  const rounds=new Map();
  for(const fixture of calendar.fixtures){
    if(!Number.isInteger(fixture.matchday)||fixture.matchday<1||fixture.matchday>38)throw new Error('Giornata del calendario ufficiale non valida.');
    if(!rounds.has(fixture.matchday))rounds.set(fixture.matchday,[]);rounds.get(fixture.matchday).push(fixture);
  }
  // Skip a round once any game has started, including rounds with postponed games.
  const eligible=[...rounds].filter(([,games])=>games.every(g=>g.status==='UPCOMING'&&(!g.kickoff||Date.parse(g.kickoff)>now.getTime())));
  eligible.sort((a,b)=>a[0]-b[0]);
  if(!eligible.length||eligible[0][1].length!==10||eligible[0][1].some(g=>!g.kickoff||!Number.isFinite(Date.parse(g.kickoff))))throw new Error('Nessuna prossima giornata completa con orari ufficiali verificati. Riprova quando il calendario è aggiornato.');
  return {matchday:String(eligible[0][0]),fixtures:eligible[0][1]};
}
export async function fetchCalendar({serviceURL,fetchImpl=fetch,signal,now=new Date()}){
  const response=await fetchImpl(`${understatServiceURL(serviceURL)}/api/calendar`,{signal,credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error('Calendario ufficiale Serie A non disponibile. Riprova Aggiorna dati.');
  const data=await response.json();return {...data,...nextMatchday(data,now)};
}
