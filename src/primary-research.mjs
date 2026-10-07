import {understatServiceURL} from './understat.mjs';
const canonical=value=>String(value).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const club=value=>({ 'ac milan':'milan','parma calcio 1913':'parma','hellas verona':'verona' }[canonical(value)]??canonical(value));
export const STAT_FIELDS={vote:'Media voto',fantamedia:'Fantamedia',rated:'Presenze a voto',goals:'Gol',assists:'Assist',conceded:'Gol subiti',penalties_saved:'Rigori parati',penalties_scored:'Rigori segnati',penalties_taken:'Rigori tirati',yellow:'Ammonizioni',red:'Espulsioni'};
export function coverageOf(players){
  const has=(p,key)=>p.observations.some(o=>o.field===key);
  return {total:players.length,statistics:players.filter(p=>has(p,'rated')).length,averages:players.filter(p=>has(p,'vote')&&has(p,'fantamedia')).length,starting:players.filter(p=>has(p,'starting')).length,availability:players.filter(p=>has(p,'availability')).length,matchup:players.filter(p=>has(p,'opponent')&&has(p,'kickoff')).length};
}
export async function fetchPrimary({serviceURL,fetchImpl=fetch,signal,now=new Date()}){
  const response=await fetchImpl(`${understatServiceURL(serviceURL)}/api/fantacalcio`,{signal,credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw new Error(`Fantacalcio non disponibile (HTTP ${response.status}). Nessun credito consumato.`);
  const data=await response.json(),age=now.getTime()-Date.parse(data.retrievedAt);
  if(data.version!==1||!Number.isFinite(age)||age< -60000||age>900000||!Array.isArray(data.players)||!Array.isArray(data.matches)||!Array.isArray(data.warnings))throw new Error('Risposta Fantacalcio non valida o scaduta.');
  return data;
}
export function primaryObservations(data,team,understat,matchday,now=new Date()){
  if(data.season!==understat.season)throw new Error('Stagioni delle fonti non coerenti.');
  const sources=[],warnings=[...data.warnings],season=`${data.season}/${data.season+1}`;
  const requested=matchday.trim(),dayMatch=/^(?:giornata\s*)?(\d{1,2})(?:[ª°])?$/i.exec(requested);
  if(requested&&!dayMatch)warnings.push('Giornata non riconosciuta: usa il numero della giornata. Previsioni e avversari non utilizzati.');
  const players=team.players.map(p=>{
    const tokens=canonical(p.name).split(' ');
    const matches=data.players.filter(q=>club(q.club)===club(p.club)&&(p.role==='P'?q.role==='P':q.role!=='P')&&tokens.every(t=>canonical(q.name).split(' ').some(u=>u===t||t.length<=2&&u.startsWith(t))));
    const observations=[];
    if(matches.length!==1){warnings.push(`${p.name}: identità Fantacalcio ${matches.length?'ambigua':'non trovata'}.`);return {...p,observations,missing:[]};}
    const row=matches[0];
    const source={id:`F${sources.length+1}`,url:'https://www.fantacalcio.it/statistiche-serie-a',title:`Fantacalcio · ${row.name} · ${season}`,text:'',retrievedAt:data.retrievedAt};sources.push(source);
    const add=(field,value,source,kind='fact',period=season,updatedAt='')=>{
      const quote=`${p.name} (${p.club}) · ${period} · ${field}: ${value}`;
      source.text+=quote+'\n';observations.push({field,value:String(value),quote,sourceId:source.id,kind,period,updatedAt,unit:['vote','fantamedia'].includes(field)?'voto':'',method:'structured'});
    };
    for(const [field,value]of Object.entries(row.stats))if(Object.hasOwn(STAT_FIELDS,field)&&value!==null){if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw new Error('Statistica Fantacalcio non valida.');add(field,String(value),source);}
    if(row.stats.rated===0)warnings.push(`${p.name}: nessuna presenza a voto; media voto e fantamedia non disponibili.`);
    const previews=data.matches.filter(m=>m.teams.some(t=>club(t)===club(p.club))&&(!requested||dayMatch&&m.matchday===Number(dayMatch[1])));
    if(previews.length!==1){warnings.push(`${p.name}: anteprima della giornata richiesta non disponibile.`);return {...p,observations,missing:[]};}
    const preview=previews[0],updated=/^(\d{2})\/(\d{2})\/(\d{4}) - \d{2}:\d{2}$/.exec(preview.updatedAt);
    const updateDay=updated?Date.UTC(+updated[3],+updated[2]-1,+updated[1]):NaN;
    const today=Date.parse(now.toLocaleDateString('sv-SE',{timeZone:'Europe/Rome'})+'T00:00:00Z');
    if(!Number.isFinite(updateDay)||today-updateDay<0||today-updateDay>2*86400000){warnings.push(`${p.name}: anteprima senza aggiornamento recente; previsioni escluse.`);return {...p,observations,missing:[]};}
    const ids=preview.teams.map(t=>understat.teams.filter(u=>club(u.name)===club(t)));
    const fixtures=ids.every(list=>list.length===1)?understat.fixtures.filter(f=>!f.completed&&f.homeId===ids[0][0].id&&f.awayId===ids[1][0].id&&Date.parse(f.kickoff)>now.getTime()):[];
    // A fresh page can still describe an old/different match. Never merge those forecasts.
    if(fixtures.length!==1){warnings.push(`${p.name}: calendario Fantacalcio/Understat non confermato; previsioni escluse.`);return {...p,observations,missing:[]};}
    const detail={id:`F${sources.length+1}`,url:'https://www.fantacalcio.it/probabili-formazioni-serie-a',title:`Fantacalcio · giornata ${preview.matchday}`,text:'',retrievedAt:data.retrievedAt};sources.push(detail);
    const period=`Giornata ${preview.matchday} · ${season}`;
    const side=club(preview.teams[0])===club(p.club)?0:1;
    add('opponent',preview.teams[1-side],detail,'fact',period,preview.updatedAt);
    add('venue',side===0?'Casa':'Trasferta',detail,'fact',period,preview.updatedAt);
    const fixtureSource=sources.find(s=>s.id==='U1')??{id:'U1',url:understat.sourceUrl,title:'Understat · calendario',text:'',retrievedAt:understat.retrievedAt};if(!sources.includes(fixtureSource))sources.push(fixtureSource);
    add('kickoff',fixtures[0].kickoff,fixtureSource,'fact',period);
    const statuses=preview.players.filter(q=>q.id===row.id&&club(q.club)===club(p.club));
    if(statuses.length===1){
      const status=statuses[0];
      if(status.starting)add('starting',status.starting+(status.probability===null?'':` · ${status.probability}% editoriale di titolarità, non probabilità di voto`),detail,'forecast',period,preview.updatedAt);
      if(status.notes.length)add('availability',status.notes.join('; '),detail,'forecast',period,preview.updatedAt);
    }
    return {...p,observations,missing:[]};
  });
  warnings.push('L’assenza dall’elenco infortunati non conferma la disponibilità. Piazzati e notizie aggiuntive non sono raccolti da queste tabelle.');
  return {players,sources,warnings,coverage:coverageOf(players)};
}
