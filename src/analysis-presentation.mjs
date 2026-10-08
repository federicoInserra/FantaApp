import {DEFAULT_MODEL,modelInfo,usageLabel} from './ai-models.mjs';
import {forecastTotals} from './forecast.mjs';
export const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const date=value=>new Date(value).toLocaleString('it-IT',{timeZone:'Europe/Rome'});
const number=value=>value.toLocaleString('it-IT',{maximumFractionDigits:1});
export const dollars=value=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'USD',minimumFractionDigits:4,maximumFractionDigits:4}).format(value);
export function recommendationView(rec,stale){
  const model=modelInfo(rec.model??DEFAULT_MODEL).label;
  // Only our generated summary has this prefix. Legacy/plain answers remain complete.
  const separator=rec.text.indexOf('\n\n');
  const hasSummary=rec.lineup&&rec.text.startsWith('Modulo: ')&&separator>=0;
  const explanation=hasSummary?rec.text.slice(separator+2):rec.text;
  const paragraphs=explanation.split(/\n\s*\n/).filter(p=>p.trim()).map(p=>`<p>${escape(p)}</p>`).join('');
  const forecast=rec.forecast?forecastTotals(rec.forecast):null;
  return `<section class="ai-result analysis-surface" aria-labelledby="proposal-title">
    <header class="analysis-section-head"><div><p class="eyebrow">LA TUA PROPOSTA</p><h3 id="proposal-title">Proposta di formazione</h3></div><span class="analysis-chip">${escape(model)}</span></header>
    <p class="analysis-meta">Salvata il ${escape(date(rec.createdAt))}</p>
    <p id="recommendation-stale" class="import-error analysis-alert" ${stale?'':'hidden'}>Questa proposta è superata. Generane una nuova con dati aggiornati.</p>
    <div class="proposal-metrics">${rec.lineup?`<div><span>Modulo scelto</span><strong>${escape(rec.lineup.formation)}</strong></div>`:''}${forecast?`<div><span>Fantapunti stimati</span><strong>${number(forecast.expected)} <small>fp</small></strong><p>Intervallo ${number(rec.forecast.low)}–${number(rec.forecast.high)}</p></div>`:''}<div><span>Costo stimato</span><strong class="proposal-cost">${rec.aiUsage?escape(dollars(rec.aiUsage.usd)):'—'}</strong><p>${rec.aiUsage?'Questa richiesta':'Token non disponibili'}</p></div></div>
    ${forecast?'<p class="analysis-meta">Stima indicativa, da verificare prima della consegna. Undici e panchina sono sul campo qui sotto.</p>':''}
    <div class="proposal-rationale"><h4>Le scelte decisive</h4><div class="ai-result-text">${paragraphs}</div></div>
    <details class="analysis-disclosure"><summary>Proposta completa e fonti <span aria-hidden="true">+</span></summary><div class="analysis-disclosure-body"><div class="proposal-original">${escape(rec.text)}</div><p class="field-hint">Ricerca del ${escape(date(rec.researchAt))} · ${escape(rec.matchday||'Prossima giornata')}</p><p class="field-hint">${escape(usageLabel(rec.aiUsage))}</p>${rec.aiUsage?`<p class="field-hint">Tariffe standard USD del ${escape(rec.aiUsage.pricingDate)}. Stima senza imposte o accordi personalizzati.</p>`:''}<ul>${rec.sources.map(source=>`<li><a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">[${escape(source.id)}] ${escape(source.title)}</a></li>`).join('')}</ul></div></details>
  </section>`;
}
