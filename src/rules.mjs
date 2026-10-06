export const RULE_GROUPS = [
  {
    "title": "Configurazione della lega",
    "rules": [
      "10 squadre.",
      "500 crediti iniziali.",
      "Rosa composta da 3 portieri, 8 difensori, 8 centrocampisti e 6 attaccanti.",
      "Moduli utilizzabili: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-2-3, 5-3-2 e 5-4-1.",
      "Massimo 5 sostituzioni per giornata.",
      "Nessun cambio di modulo a giornata iniziata."
    ]
  },
  {
    "title": "Modificatore difesa",
    "rules": [
      "Si attiva soltanto se vanno a voto almeno 4 difensori.",
      "La media è calcolata sul voto puro del portiere e sui 3 migliori voti puri dei difensori.",
      "Media almeno 6,00: +1 punto.",
      "Media almeno 6,50: +3 punti."
    ]
  },
  {
    "title": "Punteggio",
    "rules": [
      "Prima soglia gol a 66 punti.",
      "Una rete aggiuntiva ogni 6 punti: 72, 78, 84 e così via.",
      "Bonus e malus classici.",
      "Portiere imbattuto: +1 punto."
    ]
  },
  {
    "title": "Principio di formazione",
    "rules": [
      "Il 4-3-3 è il modulo di riferimento quando quattro difensori affidabili hanno buone probabilità di prendere voto. Il 3-4-3 va usato solo quando il quarto difensore è particolarmente sfavorito o il quarto centrocampista ha un vantaggio offensivo sufficiente a compensare la perdita del modificatore."
    ]
  },
  {
    "title": "Formato delle formazioni",
    "rules": [
      "Scrivere sempre accanto a ogni giocatore la squadra avversaria tra parentesi.",
      "Formato obbligatorio: `Giocatore (vs Avversaria)`.",
      "Applicare il formato sia ai titolari sia alle riserve ordinate."
    ]
  }
];
export const defaultRules = () => RULE_GROUPS.flatMap(group => group.rules);
export const teamRules = team => team.rules ?? defaultRules();
export function rulesText(team) {
  const rules = teamRules(team);
  let i = 0;
  return RULE_GROUPS.map(group => {
    const values = group.rules.map(() => rules[i++]).filter(rule => rule.trim());
    return values.length ? group.title + ':\n' + values.map(rule => '- ' + rule).join('\n') : '';
  }).filter(Boolean).join('\n\n');
}
export const validRules = rules => Array.isArray(rules) && rules.length === defaultRules().length && rules.every(rule => typeof rule === 'string' && rule.length <= 2000);
