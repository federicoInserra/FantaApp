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

In Vercel → Environment Variables configura `FIREWORKS_API_KEY` e `TAVILY_API_KEY` per Production e ridistribuisci. Le chiavi restano sul server. All’avvio l’app controlla automaticamente la presenza delle chiavi, senza consumare credito e senza verificarne la validità.

**Aggiorna dati** legge Understat, cerca voti e notizie con Tavily e passa gli estratti a GLM. Le osservazioni devono avere citazioni presenti nei testi; questo controllo non garantisce l’interpretazione corretta. **Suggerisci formazione** passa a DeepSeek rosa, regole e raccolta, senza strumenti web. Le risposte sono proposte da verificare, non modifiche automatiche della squadra.

Le raccolte di ricerca, separate dall’archivio squadre, restano sul dispositivo e scadono dopo sei ore o cambiamenti di rosa/giornata. La ricerca costa indicativamente numero giocatori + un gruppo notizie ogni quattro + estrazione iniziale: circa 33 crediti Tavily per 25 giocatori, oltre ai token Fireworks. Nessun tentativo automatico. Annullare non garantisce l’interruzione della fatturazione delle richieste già inviate.

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

La preview usa un database Postgres temporaneo tramite PGlite e non scrive su Neon. Senza `--demo-db`, il server usa la connessione database configurata nell’ambiente. I test coprono creazione/importazione, modifiche della rosa, conflitti e fallimenti senza credenziali reali.

Vercel usa `vercel.json`, Node 22, `npm test && npm run build` e output `dist`. Il build copia solo asset pubblici; `.env*`, report e codice server non entrano nel bundle statico. Dopo un aggiornamento chiudi tutte le schede e finestre installate dell’app per attivare il nuovo service worker.

Per iPhone: apri l’app in Safari e usa **Condividi → Aggiungi alla schermata Home**. Le squadre richiedono comunque Internet e l’accesso Vercel.

Il tema usa bianco caldo, carbone, accenti colorati e il font Doto, incluso con licenza SIL Open Font License in `fonts/OFL.txt`.
