import {engineRules,defensiveModifier} from '../src/statistical-engine.mjs';
import {ROLES} from '../src/lineup.mjs';
const canonical=v=>String(v??'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const club=v=>({'ac milan':'milan','hellas verona':'verona','parma calcio 1913':'parma'}[canonical(v)]??canonical(v));
const round=n=>Math.round(n*100)/100;
export function actualLineupScore(record,data) {
  const base={version:1,checkedAt:data.retrievedAt,sourceUrl:data.sourceUrl,provider:data.provider};
  if(record.season!==data.season||record.matchday!==data.matchday)throw new Error('Giornata dei voti non coerente.');
  let rules;
  try{rules=engineRules({rules:record.rules});}catch{return {...base,status:'unsupported',reason:'Calcolo automatico disponibile per il profilo Classic predefinito (0–5 sostituzioni). Le regole salvate sono diverse.'};}
  if(!data.complete)return {...base,status:'pending',reason:'In attesa della fine delle dieci partite e dei voti completi della giornata.'};
  const lineup=record.recommendation.lineup,byId=new Map(record.players.map(p=>[p.id,p]));
  const outcomes=new Map(),missing=[];
  for(const id of [...lineup.starters,...lineup.bench]) {
    const player=byId.get(id);if(!player)throw new Error('Rosa storica non valida.');
    let candidates;
    if(player.fantacalcioId)candidates=data.players.filter(p=>p.id===player.fantacalcioId);
    else {
      const tokens=canonical(player.name).split(' ');
      candidates=data.players.filter(p=>club(p.club)===club(player.club)&&(player.role==='P'?p.role==='P':p.role!=='P')&&tokens.every(t=>canonical(p.name).split(' ').some(u=>u===t||t.length<=2&&u.startsWith(t))));
    }
    const row=candidates.length===1?candidates[0]:null;
    if(candidates.length>1||row?.status==='unknown'||(!row&&!player.fantacalcioId)||(row&&(player.role==='P')!==(row.role==='P'))){outcomes.set(id,{id,role:player.role,unknown:true});continue;}
    outcomes.set(id,{id,role:player.role,rated:row?.status==='rated',vote:row?.vote??0,points:row?.status==='rated'?round(row.fantasyVote+(player.role==='P'&&row.conceded===0?rules.cleanSheet:0)):0,sourceId:row?.id??player.fantacalcioId});
  }
  const counted=[],substitutions=[],used=new Set();let changes=0;
  // Apply the same Classic substitution convention to all methods, regardless of JSON ordering.
  const orderedStarters=Object.keys(ROLES).flatMap(role=>lineup.starters.filter(id=>byId.get(id).role===role));
  for(const id of orderedStarters) {
    let outcome=outcomes.get(id);
    if(outcome.unknown){missing.push(byId.get(id).name);continue;}
    if(!outcome.rated&&changes<rules.maxSubs){
      for(const sub of lineup.bench){const candidate=outcomes.get(sub);if(used.has(sub)||candidate.role!==outcome.role)continue;
        if(candidate.unknown){missing.push(byId.get(sub).name);break;}
        if(candidate.rated){used.add(sub);changes++;outcome=candidate;substitutions.push({out:id,in:sub});break;}
      }
    }
    counted.push({...outcome,starterId:id});
  }
  // Unknown unused reserves do not affect the total. Unknown starters or priority replacements do.
  if(missing.length)return {...base,status:'pending',reason:`Identità o voto da verificare: ${[...new Set(missing)].join(', ')}. Aggiorna i dati prima delle prossime proposte per salvare le identità Fantacalcio.`,missing:[...new Set(missing)]};
  const rated=counted.filter(p=>p.rated);
  if(new Set(rated.map(p=>p.sourceId)).size!==rated.length)return {...base,status:'pending',reason:'Due giocatori della rosa corrispondono alla stessa identità Fantacalcio. Verifica la rosa prima di confrontare i metodi.'};
  const modifier=defensiveModifier(counted),total=round(counted.reduce((sum,p)=>sum+p.points,0)+modifier);
  const late=!record.roundStartsAt||Date.parse(record.recommendation.createdAt)>=Date.parse(record.roundStartsAt);
  return {...base,status:'complete',total,modifier,substitutions,players:counted,late,goals:total<66?0:1+Math.floor((total-66)/6)};
}
