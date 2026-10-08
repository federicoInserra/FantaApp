# FantaApp

App personale di Fantacalcio, ottimizzata per mobile, con squadre salvate nel database Neon e backend su Vercel. Il database è l’unica fonte delle squadre. Ogni visita le carica da `/api/teams`; creazione, aggiunta/rimozione giocatori, disponibilità, nome, modulo e regole vengono confermati solo dopo il salvataggio nel database. È necessaria una connessione Internet.

## Creare e modificare squadre

**Nuova squadra** richiede nome e listone (FantaMaster o Leghe). L’importazione è facoltativa: puoi incollare testo oppure selezionare un file TXT UTF-8, massimo 64 KB e 40 giocatori. Il nome inserito nel modulo prevale sul nome del file.

```text
Squadra: Atletico
P - Maignan (Milan)
C - Barella (Inter)
A - Lucca (Napoli)
```

L’anteprima segnala righe non valide e duplicati. Puoi modificare il testo o rimuovere l’importazione per creare una rosa vuota. **Crea squadra** salva la nuova squadra nel database prima di aprire la rosa.

Nella rosa, **+ Giocatore** apre il listone scelto. Ogni aggiunta viene salvata nel database. Tocca un giocatore per cambiarne la disponibilità o rimuoverlo; anche queste modifiche vengono salvate nel database. **Gestisci** permette di rinominare o eliminare la squadra.

Le 18 regole predefinite sono modificabili per squadra e vengono salvate quando esci dal campo modificato. Svuotare una regola la esclude dal prompt AI. Le modifiche testuali alle regole guidano l’AI ma non cambiano automaticamente i moduli disponibili nel selettore o il calcolo della bozza indicativa.

## Database e accesso

Collega `fantaapp-db` a Production su Vercel. Il backend legge `DATABASE_URL` o `POSTGRES_URL`, oppure le varianti con prefisso `DB_` generate dall’integrazione Vercel (con fallback alle varianti unpooled); la stringa non deve entrare nel frontend o nel repository. Al primo accesso crea, se assente, `fantaapp_workspace`, senza sostituire dati esistenti. È un unico archivio privato condiviso dai dispositivi e dagli utenti autorizzati al progetto Vercel.

Mantieni **Vercel Authentication → All Deployments**. L’autenticazione è fornita da Vercel; il controllo Origin del codice non la sostituisce. Le Preview devono usare un database separato se vuoi provarvi modifiche.

Ogni scrittura verifica la revisione precedente e usa SQL parametrizzato. Se un altro dispositivo ha già modificato le squadre, la richiesta viene rifiutata. In caso di conflitto o errore di rete, usa **Ricarica squadre dal database** prima di effettuare altre modifiche. Il client non dichiara riuscito un salvataggio senza conferma del server e non accoda scritture quando sei offline. Se la risposta si perde dopo il commit, ricaricare mostra il risultato effettivo senza ripetere la creazione.

Il service worker conserva solo i file dell’interfaccia e i listoni pubblici. Le risposte API non sono memorizzate. Per aprire e modificare le squadre serve il backend: GitHub Pages da solo non può eseguire l’app completa.

## Listoni

`data/fantamaster.json` (583 giocatori) e `data/leghe.json` (599 giocatori, di cui 64 fuori lista) sono istantanee degli Excel forniti. Ogni catalogo conserva ID, nome, club, ruolo classico e quotazione. I ruoli Mantra e il flag trequartista sono informazioni aggiuntive; i moduli usano P/D/C/A. I listoni non si aggiornano automaticamente. Le statistiche dei nuovi giocatori restano vuote, senza numeri inventati.

Per rigenerarli:

```sh
python3 scripts/import-player-lists.py /percorso/fantamaster_list.xlsx /percorso/leghe_fantacalcio_list.xlsx
```

## Ricerca e formazione AI

In Vercel → Environment Variables configura `FIREWORKS_API_KEY` per Production e ridistribuisci. Le chiavi restano sul server. All’avvio l’app controlla automaticamente la presenza delle chiavi, senza consumare credito e senza verificarne la validità.

**Aggiorna dati** legge direttamente le tabelle pubbliche Fantacalcio (media voto, fantamedia, presenze a voto, bonus/malus) e le probabili formazioni, più i dati numerici Understat. Non chiama Tavily o Fireworks e non consuma crediti dei provider. **Suggerisci formazione** resta una chiamata a DeepSeek e passa rosa, regole e raccolta senza strumenti web.

La proposta usa un budget massimo di 131.072 token e ragionamento `high`, applicato anche dal proxy Vercel. Il budget comprende la generazione del modello, non una richiesta di risposta lunga: il prompt chiede un oggetto JSON con modulo, ID dei titolari e della panchina, e una spiegazione di circa 200–300 parole, una stima best-effort e motivi individuali. L’app valida ID, disponibilità e conteggi per ruolo, poi salva proposta e modulo insieme e aggiorna automaticamente il campo e la panchina. Le vecchie proposte solo testuali restano leggibili; vanno rigenerate per popolare il campo. Un cambio manuale di modulo mostra una bozza, con un pulsante per ripristinare la proposta AI; rosa, regole, giornata o ricerca cambiati invalidano la vista AI. Il regolamento salvato resta invariato. Il formato JSON è richiesto nel prompt e validato nell’app; non si forza `json_schema` nel provider, perché può disabilitare il ragionamento. Nell’input le osservazioni strutturate conservano valore, fonte, periodo, tipo e data, ma omettono la citazione che li ripete; le citazioni da testo libero e i numeri Understat sono conservati.

Il prompt confronta i candidati insieme alle riserve dello stesso ruolo, distinguendo impiego significativo, ingresso breve con voto e senza voto. Chiede di pesare i campioni piccoli, segnalare previsioni contraddittorie e confrontare i moduli attraverso i giocatori che cambiano e il modificatore ottenibile. La spiegazione si concentra sui 2–3 ballottaggi decisivi, sul rischio accettato e sulle nuove informazioni che cambierebbero la scelta; le preferenze tattiche restano distinte dai vincoli della lega.

Sotto la proposta, **Chiedi a DeepSeek** permette di fare domande sui giocatori e sui ballottaggi. Ogni domanda invia rosa, regole, ricerca associata, testo originale, titolari/panchina, stime e gli scambi precedenti al modello già configurato, senza strumenti web. La risposta è solo un chiarimento e non cambia la formazione. Il modello deve verificare la premessa della domanda e riconoscere eventuali errori nella proposta, senza inventare motivazioni. Ogni invio può consumare credito Fireworks.

Le ultime 10 domande e risposte sono salvate nel database dentro la proposta e condivise tra dispositivi; una nuova proposta avvia una conversazione nuova. Cambiare rosa, regole, giornata o ricerca blocca nuove domande sulla vecchia proposta, per non mescolare contesti. È possibile discutere una raccolta più vecchia di sei ore se è ancora quella della proposta: i dati restano storici, senza aggiornarli implicitamente. Il salvataggio verifica anche l’identità della proposta e l’ultimo scambio per evitare risposte associate al contesto sbagliato. Invii duplicati sono disabilitati durante l’attesa; annullamenti, errori e conflitti conservano la conversazione già salvata e il testo della domanda. I test usano risposte simulate, senza chiamate AI a pagamento.

I log Vercel `AI response diagnostics` riportano solo stato, motivo di interruzione, budget richiesto/restituito, token input/output/ragionamento, lunghezza della risposta visibile e durata. Non contengono rosa, prompt, risposte, ragionamento testuale o chiavi. Le risposte incomplete non vengono salvate; l’errore mostra i token effettivi quando forniti dal provider. Per un test live apri la squadra, premi **Suggerisci formazione** una sola volta e confronta il risultato con questi contatori nei log `/api/ai`; il test consuma credito Fireworks.

Il parser verifica stagione, intestazioni, identità/club e ambiguità. Le medie di chi ha zero presenze a voto restano mancanti, non zero. Le previsioni sono usate solo se aggiornate negli ultimi due giorni di calendario, per la giornata richiesta (numero o vuoto), e se il confronto delle squadre casa/trasferta trova una sola partita futura in Understat. Le percentuali editoriali indicano titolarità, non probabilità di prendere voto. L’assenza dall’elenco infortunati non prova la disponibilità. Piazzati e notizie aggiuntive restano da verificare.

Il relay `/api/fantacalcio` scarica solo due URL fissi, non inoltra credenziali, limita dimensione e timeout e conserva una cache server di cinque minuti. Se una fonte cambia struttura il parser segnala dati mancanti; non attiva ricerche a pagamento. Ogni squadra conserva nel database un solo oggetto `research` e un solo oggetto `recommendation`, nello stesso record `fantaapp_workspace` delle squadre. Ogni esecuzione riuscita sostituisce il risultato precedente dopo la conferma del server; non viene mantenuta una cronologia. I timestamp di ricerca completata e proposta sono visibili e condivisi fra dispositivi. La ricerca resta consultabile dopo sei ore, ma deve essere aggiornata prima di una nuova analisi. Una nuova ricerca rende superata la proposta precedente, che resta leggibile con le sue fonti finché non viene rigenerata. Anche modifiche a rosa, regole o giornata rendono superata la proposta. Nessuna ricerca o proposta viene letta o scritta nel localStorage; i risultati del vecchio flusso locale devono essere rigenerati.

Test live senza chiavi o crediti: `node scripts/research-free-smoke.mjs /percorso/rosa.txt`. Il report diagnostico finisce in `research-results/free-research.json` (escluso da Git). Eseguire manualmente: i test automatici usano estratti HTML locali con casi di regressione.

Il backend accetta solo modelli, fonti e parametri previsti dall’app, limita dimensioni e token, e non inoltra cookie del browser ai provider. Timeout provider 170 secondi e funzione AI 180 secondi. `/api/ai-status` restituisce soltanto booleani di configurazione.

## Understat

Il relay legge `https://understat.com/getLeagueData/Serie_A/{stagione}` con `X-Requested-With: XMLHttpRequest`. È l’endpoint pubblico usato dal sito, non un’API ufficiale con garanzia di stabilità. Il codice calcola xG, npxG, xA, tiri e valori per 90 dei giocatori, e medie xG/xGA delle squadre totali/casa/trasferta con campioni. Valori mancanti restano distinti dallo zero. Il matching usa nome/iniziali e club senza fuzzy match; ambiguità rimangono visibili.

Il calendario contiene orari UTC e non espone il numero della giornata. L’AI deve incrociarlo con le altre fonti, senza equiparare automaticamente prossima partita e giornata richiesta. I dati dei trasferiti possono includere più club. Il timestamp di recupero e la data dell’ultima partita registrata sono mostrati separatamente.

Verifica senza API a pagamento: `node scripts/understat-smoke.mjs`. I report `research-results/` sono esclusi da Git. Su Vercel il frontend usa il relay dello stesso dominio; il Worker Cloudflare rimane un’alternativa separata.

## Sviluppo e deploy

```sh
npm ci
npm test
VERCEL=1 npm run build
PORT=8013 node scripts/serve-understat.mjs --demo-db
```

La preview usa un database Postgres temporaneo tramite PGlite e non scrive su Neon. Senza `--demo-db`, il server usa la connessione database configurata nell’ambiente. I test coprono creazione/importazione, modifiche della rosa, risultati e timestamp condivisi tra dispositivi, sostituzione dei risultati senza cronologia, conflitti e fallimenti senza credenziali reali. Per verificare la UI della proposta senza costi si usa un testo dimostrativo esplicito nel solo database locale di test.

Vercel usa `vercel.json`, Node 22, `npm test && npm run build` e output `dist`. Il build copia solo asset pubblici; `.env*`, report e codice server non entrano nel bundle statico. Dopo un aggiornamento chiudi tutte le schede e finestre installate dell’app per attivare il nuovo service worker.

Per iPhone: apri l’app in Safari e usa **Condividi → Aggiungi alla schermata Home**. Le squadre richiedono comunque Internet e l’accesso Vercel.

Il tema usa bianco caldo, carbone, accenti colorati e il font Doto, incluso con licenza SIL Open Font License in `fonts/OFL.txt`.

La previsione fantapunti è indicativa: DeepSeek restituisce voto puro, bonus e malus stimati per ogni titolare, un modificatore di squadra e un intervallo plausibile con ipotesi. Il totale è calcolato nell’app, con una cifra decimale, e validato rispetto all’intervallo. Le statistiche storiche non vengono sovrascritte dalle previsioni. Toccare un giocatore sul campo apre dati Fantacalcio/Understat con periodo e fonti, stima individuale e motivo della scelta. Le proposte precedenti sono compatibili e richiedono una nuova analisi per aggiungere questi campi; proposte superate o bozze manuali non mostrano la vecchia previsione come corrente. La richiesta high può durare fino a 5 minuti (proxy 290 secondi, funzione Vercel e client 300 secondi).
