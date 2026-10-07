# FantaApp

Una piccola app statica per organizzare più squadre Fantacalcio, gestire le rose e ottenere un undici suggerito. Si apre direttamente in un browser e non richiede account, backend o dipendenze di build.

## Funzioni

- Crea più squadre, passa da una all'altra ed elimina quelle che non servono.
- Scegli FantaMaster o Leghe per ogni nuova squadra. Cerca e aggiungi giocatori dal relativo listone, filtra per ruolo e segna le assenze.
- Scegli tra otto moduli. L'undici suggerito seleziona i giocatori disponibili con il punteggio più alto per ruolo: **55% forma + 45% media voto**.
- Salva le modifiche nel `localStorage` del browser.

Al primo avvio è presente una squadra di esempio. **Nomi, statistiche e notizie sono dimostrativi**: l'app non riceve dati sportivi in tempo reale. I dati restano nel browser usato e non si sincronizzano fra dispositivi.

## Avvio locale

```sh
python3 -m http.server 8000
```

Apri `http://localhost:8000`. Per i test della logica delle formazioni:

```sh
node --test tests/*.test.mjs
```

## GitHub Pages

Il workflow in `.github/workflows/pages.yml` pubblica la cartella del repository dopo ogni push su `main`. Nelle impostazioni del repository, seleziona **Settings → Pages → Build and deployment → GitHub Actions**. Il sito sarà disponibile all'indirizzo `https://federicoInserra.github.io/FantaApp/` quando il primo deploy sarà riuscito.

## Installazione su iPhone

1. Apri https://federicoinserra.github.io/FantaApp/ in Safari.
2. Tocca Condividi → Aggiungi alla schermata Home → Aggiungi. Mantieni attivo “Apri come app web”, se presente.
3. Apri l’icona FantaApp con Internet e attendi “Disponibile offline” nel menu.

Le squadre sono salvate automaticamente come JSON nel localStorage del dispositivo, senza account o database. Usa l’app dalla schermata Home: Safari e l’app installata possono avere archivi separati. La cancellazione dei dati o la perdita del dispositivo può comportare la perdita delle squadre.

L’app funziona offline dopo il primo caricamento completo. Gli aggiornamenti vengono scaricati online e si attivano dopo aver chiuso tutte le finestre dell’app e averla riaperta. Quando cambiano i file pubblicati, incrementa la versione della cache in `sw.js`.

Per preparare i soli file pubblici: `node scripts/build.mjs`.

## Listoni giocatori

I file `data/fantamaster.json` (583 giocatori) e `data/leghe.json` (599 giocatori, di cui 64 fuori lista) sono istantanee dei due Excel forniti. Sono pubblici e disponibili offline; le rose personali restano nel localStorage del dispositivo. Nessuna chiamata a servizi esterni è necessaria.

Ogni catalogo conserva ID, nome, club, ruolo classico e quotazione. I ruoli Mantra e il flag trequartista sono mostrati come informazioni aggiuntive; i moduli usano P/D/C/A. I campi FantaSquadra e Costo del file Leghe non vengono pubblicati. FantaMaster viene letto dal foglio generale per evitare doppioni dei fogli per ruolo. Leghe usa gli ID originali; FantaMaster usa un ID derivato da nome e club (può cambiare se cambia il club).

Per rigenerare le istantanee senza dipendenze Python:

```sh
python3 scripts/import-player-lists.py /percorso/fantamaster_list.xlsx /percorso/leghe_fantacalcio_list.xlsx
```

I giocatori nuovi non ricevono statistiche inventate: forma e media voto sono assenti. La formazione rimane una bozza indicativa fino all’integrazione delle statistiche reali. I listoni non si aggiornano automaticamente. Le rose già salvate vengono conservate; scelgono il listone al prossimo inserimento di un giocatore.

## Creare una squadra e importare giocatori

Apri **Nuova squadra**, inserisci il **nome** e scegli il **listone** (entrambi obbligatori). Puoi creare una rosa vuota e aggiungere giocatori manualmente in seguito, oppure usare **Importa giocatori (facoltativo)** per incollare il testo direttamente o selezionare un file e controllare l’anteprima prima di premere **Crea squadra**.

```text
Squadra: Nome nel file

P - Nome portiere (Club)
D - Nome difensore (Club)
C - Nome centrocampista (Club)
A - Nome attaccante (Club)
```

Il nome compilato nel modulo ha sempre la precedenza sull’intestazione del file. Il listone scelto viene assegnato alla squadra e usato per aggiungere altri giocatori. Nomi, club e ruoli importati restano quelli del TXT; non sono riconciliati automaticamente con il catalogo. Le statistiche restano vuote.

Il file viene letto localmente: testo semplice UTF-8, massimo 40 giocatori e 64 KB. Le righe non valide e i giocatori duplicati vengono segnalati. Un file non valido blocca la creazione finché non viene sostituito o rimosso con **Rimuovi importazione**. Chiudere il modulo annulla la selezione. Ogni creazione aggiunge una nuova squadra, senza sovrascrivere quelle esistenti; la stessa rosa può essere usata per squadre con nomi o listoni diversi.

Le squadre create nelle versioni precedenti vengono conservate. L’importazione separata è stata sostituita dal flusso di creazione. Su iPhone, usa l’app avviata dalla schermata Home per salvare la rosa nel relativo archivio.

## Analisi AI della giornata

Su Vercel le chiavi Fireworks e Tavily vengono lette soltanto dal backend (configurazione sotto). Le impostazioni mostrano se sono configurate, senza restituirle al browser. La verifica controlla la presenza, non la validità o il credito.

Su GitHub Pages o nel build statico locale, apri **Impostazioni AI** e salva le chiavi Fireworks e Tavily. Sono conservate separatamente nel localStorage e inviate solo al rispettivo provider. I campi vuoti conservano le chiavi precedenti; i pulsanti Dimentica le eliminano. Gli script sullo stesso origin possono leggerle: usa chiavi dedicate e un dispositivo fidato.

Nella formazione, **Aggiorna dati** recupera le pagine Serie A note e cerca statistiche e notizie per la rosa con Tavily. GLM organizza gli estratti e conserva solo osservazioni con citazioni presenti nei testi. Questo controllo non garantisce la correttezza dell’interpretazione: esamina fonti e campi mancanti. Tavily riceve nomi e club; Fireworks riceve rosa, estratti e, per la formazione, regolamento.

**Suggerisci formazione** passa i dati a DeepSeek senza strumenti web. La raccolta è salvata per squadra e richiede aggiornamento dopo sei ore o cambiamenti di rosa/giornata. Una ricerca fallita conserva i dati precedenti. Le proposte rimangono in memoria e non modificano la rosa.

Budget indicativo per aggiornamento: numero giocatori + un gruppo notizie ogni quattro + estrazione iniziale (circa 33 crediti Tavily per 25 giocatori), oltre ai token Fireworks. Nessun tentativo automatico. Timeout locale: dieci minuti per ricerca e tre per analisi. Annullare non garantisce l’interruzione della fatturazione delle richieste già inviate. La ricerca web Fireworks non è necessaria. Understat richiede il piccolo relay descritto sotto. Richieste Fireworks con `store: false`; valgono le condizioni dei provider.

## Tema visivo

Interfaccia minimale in bianco caldo e carbone con accenti rossi, tipografia a matrice di punti e illustrazione SVG originale del pallone. Il font Doto è incluso localmente con licenza SIL Open Font License in `fonts/OFL.txt`, così il tema resta disponibile offline senza richieste a servizi di font esterni. Layout adattivo per desktop e smartphone, focus visibile e supporto alla preferenza di movimento ridotto.

Il campo di testo aggiorna automaticamente l’anteprima. Caricare un file sostituisce il testo; puoi poi modificarlo. Svuotare il campo o rimuovere l’importazione permette di creare una rosa vuota. Le modifiche annullano eventuali letture di file precedenti ancora in corso.

## Regole per squadra

La voce **Regole** mostra il regolamento della squadra attiva. Tutte le 18 regole del documento fornito sono precompilate, suddivise in configurazione, modificatore difesa, punteggio, principio di formazione e formato delle formazioni. Ogni campo è modificabile e viene salvato automaticamente nel localStorage della squadra. Svuotare un campo esclude quella regola dal prompt AI. Le squadre esistenti mostrano gli stessi valori predefiniti fino alla prima modifica; le nuove squadre ricevono copie indipendenti.

L’analisi AI usa automaticamente il regolamento salvato e segnala una raccomandazione precedente come superata quando cambiano regole o rosa. Il selettore locale include gli otto moduli del regolamento iniziale; le modifiche testuali alle regole guidano l’AI, senza costituire vincoli automatici sul selettore manuale, sulla dimensione della rosa o sul calcolo dei punteggi demo. Le nuove squadre partono dal 4-3-3; quelle esistenti conservano il modulo scelto.


### Navigazione mobile

La home mostra le squadre salvate. Ogni scheda apre direttamente la rosa; Formazione e Regole sono sezioni interne della squadra. I link includono l’ID della squadra per mantenere il contesto usando Indietro o ricaricando. Gli archivi esistenti sono conservati; una nuova installazione parte senza squadre demo.

La creazione richiede nome e listone, con importazione TXT/testo facoltativa. La rosa è suddivisa per ruolo, con ricerca per nome/club e filtri. Toccare un giocatore apre disponibilità e rimozione. “Gestisci” permette di rinominare o eliminare la squadra, anche l’ultima. Le impostazioni AI e l’installazione sono nel menu Impostazioni.

## Estrazione Understat

La pagina Serie A carica numeri da `https://understat.com/getLeagueData/Serie_A/{stagione}` con l’header `X-Requested-With: XMLHttpRequest`. È l’endpoint pubblico usato dal sito, non un’API ufficiale con garanzia di stabilità. Verificato il 7 ottobre 2026: 448 giocatori, 20 squadre, 380 partite. Il browser non può leggerlo direttamente (CORS); Tavily Extract restituisce 404 per questo endpoint.

`worker/understat-worker.mjs` fornisce un relay stateless, senza account applicativi, chiavi o database. Accetta solo GET della Serie A per una stagione valida, verifica il formato, espone soltanto campi pubblici necessari e usa la cache Cloudflare per cinque minuti. CORS consente soltanto gli origin configurati; non è autenticazione e l’endpoint pubblico può essere usato da client non browser. Non inoltra chiavi o header del chiamante e non accetta URL arbitrari. Errori, JSON malformato e cambi di schema interrompono l’aggiornamento prima delle chiamate a pagamento.

Il codice calcola xG, npxG, xA, minuti, tiri e valori per 90; medie xG/xGA squadra per partita, separate in totale/casa/trasferta e accompagnate dal numero di partite. I valori mancanti restano null, distinti dallo zero. Il campione dei trasferiti può includere più club. Matching nome/iniziali + club, senza fuzzy match: ambiguità o assenze rimangono visibili. Presenze Understat non sono presenze a voto Fantacalcio.

Il calendario include le partite future nei prossimi 14 giorni, con orari UTC. L’endpoint non espone il numero della giornata: l’AI deve incrociarlo con il calendario raccolto, senza equiparare automaticamente “prossima partita” e giornata richiesta. Tutte le 20 squadre sono incluse per consentire il confronto con l’avversaria; nessuna probabilità di bonus viene inventata. Il timestamp di recupero e la data dell’ultima partita registrata sono entrambi mostrati.

Test live senza API a pagamento: `node scripts/understat-smoke.mjs`. Il report locale è in `research-results/understat-live.json` (escluso da Git).

Preview locale con l’adattatore Vercel: `VERCEL=1 npm run build`, poi `npm run dev`. Apri `http://localhost:8007`, Impostazioni AI e premi Verifica collegamento. Il server serve solo dist, non file .env o report locali. Senza `VERCEL=1`, il frontend mantiene il campo per configurare un relay esterno.

Deploy del relay, dall’account Cloudflare del proprietario: `npx wrangler deploy --config worker/wrangler.jsonc`. Configurare `ALLOWED_ORIGINS` per il dominio dell’app. Nessun secret richiesto. Dopo il deploy incollare il dominio HTTPS workers.dev nel campo Servizio Understat dell’app. Il build GitHub Pages continua a pubblicare solo il frontend: non distribuisce automaticamente il Worker. I limiti del piano Workers si applicano anche a questo servizio.

## Hosting Vercel Hobby

La configurazione `vercel.json` pubblica il frontend da `dist` e la funzione Node 22 `api/understat.mjs`. Il build esegue i test prima di generare i file pubblici. Su Vercel il servizio Understat usa automaticamente lo stesso dominio dell’app; non occorre un Worker separato. La cache dei dati pubblici dura cinque minuti per istanza attiva della funzione. Le risposte HTTP non vengono salvate in cache pubbliche né dal service worker.

Dopo aver pubblicato queste modifiche nel repository:

1. Crea un account Vercel Hobby e importa il repository FantaApp, con directory principale del repository e framework Other. Build e output sono definiti in `vercel.json`.
2. Per accesso privato, configura Security → Deployment Protection → Vercel Authentication → All Deployments. È disponibile gratuitamente anche per produzione ([annuncio Vercel](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)). Verifica sia la home sia `/api/understat?season=2026` da una finestra non autenticata. Il piano Hobby da solo non rende privata l’app.
3. Verifica il collegamento Understat nelle impostazioni AI dopo l’accesso. La funzione non richiede chiavi API.

Questa preparazione non configura un database: squadre e regole rimangono nel localStorage. Su Vercel le chiavi provider sono gestite dal backend. Il nuovo dominio ha un archivio browser separato da GitHub Pages; le rose esistenti non migrano automaticamente. Un successivo collegamento a Neon richiederà schema, endpoint protetti, credenziali server e migrazione dei dati locali. Non inserire segreti nel codice frontend o in variabili pubbliche.

Il workflow GitHub Pages esistente rimane attivo finché non viene esplicitamente disabilitato: la protezione Vercel non protegge il vecchio sito. Il server locale non simula l’autenticazione Vercel; la protezione va verificata sul deployment reale.


### Chiavi Fireworks e Tavily sul server

Prima di attivare il backend AI, mantieni **Vercel Authentication → All Deployments** e verifica l’accesso non autenticato. L’autenticazione è fornita da Vercel, non dal controllo Origin del codice. Non disabilitare la protezione: esporrebbe le chiamate a pagamento a terzi. Il server di sviluppo è solo locale e non simula questa autenticazione.

In Project Settings → Environment Variables aggiungi `FIREWORKS_API_KEY` e `TAVILY_API_KEY` per Production. Aggiungile a Preview solo se intendi usare lì i servizi. Non usare prefissi pubblici. Dopo il salvataggio serve un nuovo deployment: le variabili non modificano le funzioni già distribuite. Nessuna chiave deve entrare nel repository, nel build statico o negli screenshot.

Su Vercel, `/api/ai-status` restituisce soltanto due booleani. `/api/ai` inoltra le richieste ai tre endpoint fissi Fireworks Responses, Tavily Search ed Extract. Non inoltra header del browser o cookie ai provider. I modelli, i token massimi, le fonti e i parametri di ricerca sono limitati sul server; strumenti web Fireworks, streaming e conservazione della risposta sono disabilitati. Richieste e risposte hanno limiti di dimensione, errori generici e nessun tentativo automatico. Timeout provider 170 secondi; funzione Vercel 180 secondi. Annullare nel browser non garantisce l’interruzione della fatturazione del provider.

Il client su Vercel rimuove le vecchie chiavi dal localStorage di quel dominio, non le carica sul server e usa solo gli endpoint dello stesso dominio con la sessione Vercel. Le eventuali chiavi salvate sul vecchio dominio GitHub Pages sono separate. Il service worker non memorizza risposte API. Il frontend statico continua a supportare chiavi locali.

Per provare senza chiamate a pagamento: `npm test`. Per una preview del flusso ospitato: `VERCEL=1 npm run build`, poi `npm run dev`. Senza variabili ambiente, lo stato deve indicare “da configurare”. Puoi avviare il server con un file env locale ignorato da Git per testare lo stato configurato: le chiavi vengono usate dai provider solo premendo Aggiorna dati o Suggerisci formazione.
