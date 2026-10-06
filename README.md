# FantaApp

Una piccola app statica per organizzare più squadre Fantacalcio, gestire le rose e ottenere un undici suggerito. Si apre direttamente in un browser e non richiede account, backend o dipendenze di build.

## Funzioni

- Crea più squadre, passa da una all'altra ed elimina quelle che non servono.
- Scegli FantaMaster o Leghe per ogni nuova squadra. Cerca e aggiungi giocatori dal relativo listone, filtra per ruolo e segna le assenze.
- Scegli tra sei moduli. L'undici suggerito seleziona i giocatori disponibili con il punteggio più alto per ruolo: **55% forma + 45% media voto**.
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

## Importare una squadra da TXT

Dal menu scegli **Importa squadra**, seleziona un file `.txt`, controlla l’anteprima e premi **Aggiungi squadra**. Il file viene letto localmente senza inviarlo a servizi esterni. Formato:

```text
Squadra: La mia squadra

P - Nome portiere (Club)
D - Nome difensore (Club)
C - Nome centrocampista (Club)
A - Nome attaccante (Club)
```

Usa testo semplice UTF-8, una riga per giocatore e i ruoli P/D/C/A. Sono accettati righe vuote, apostrofi, accenti e terminazioni Windows o Mac. Limiti: 32 caratteri per il nome della squadra, 40 giocatori, 64 KB. Le righe non valide e i giocatori duplicati sono segnalati con il numero di riga; non vengono ignorati silenziosamente.

Nomi, club e ruoli sono conservati come scritti, anche se il giocatore non è nei listoni. Non è richiesto un catalogo e non vengono inventate statistiche. La squadra importata è subito utilizzabile nell’analisi AI. Per aggiungere in seguito giocatori dai cataloghi, l’app richiede il listone; la rosa importata viene conservata.

Importare due volte la stessa rosa con lo stesso nome non crea duplicati né sovrascrive le modifiche. Dopo aver eliminato la squadra, il file può essere importato nuovamente. Le squadre esistenti restano invariate. L’interfaccia di importazione tramite link è stata sostituita da quella TXT. Su iPhone, seleziona il file dall’app avviata dalla schermata Home per salvare la rosa nel relativo archivio.

## Analisi AI della giornata

Apri **Impostazioni AI**, incolla la tua chiave Fireworks e premi **Salva chiave**. La chiave viene conservata separatamente dalle rose nel localStorage (`fantaapp.fireworks.key.v1`), non viene pubblicata né inclusa nei dati delle squadre. **Dimentica chiave** la rimuove. Il localStorage è leggibile dagli script dello stesso origin, incluse altre app sul medesimo dominio GitHub Pages: usa una chiave dedicata e un dispositivo fidato.

In **Formazione**, scegli una rosa reale, indica eventualmente la giornata e le regole della lega e premi **Analizza la giornata**. L’app chiama direttamente `https://api.fireworks.ai/inference/v1/responses` con `accounts/fireworks/models/deepseek-v4p1-flash`, un prompt predefinito in italiano e lo strumento `web_search`. Il prompt invia nomi, club, ruoli e disponibilità; esclude le statistiche demo. Richiede titolari, panchina, alternative, incertezze e fonti. L’output è un consiglio testuale da verificare: non applica automaticamente la formazione e non costituisce un’ottimizzazione numerica validata.

La ricerca web deve essere abilitata sull’account Fireworks. Errori di autorizzazione, credito, limiti, rete e risposte incomplete sono mostrati nell’app. Una risposta senza ricerca web completata viene rifiutata. Sono consentite al massimo sei chiamate agli strumenti per risposta e 6.000 token di output, con un timeout locale di tre minuti; annullare non garantisce che Fireworks interrompa l’elaborazione o la fatturazione. Non sono previsti tentativi automatici.

Le analisi rimangono in memoria durante la sessione, distinte per squadra; ricaricare la pagina le elimina. Una modifica della rosa segnala il risultato precedente come superato. La richiesta usa `store: false`; si applicano comunque le condizioni di trattamento dati del provider. Internet e credito Fireworks sono necessari; nessun backend o account FantaApp è richiesto. Le fonti strutturate con URL HTTP(S) vengono mostrate come link e tutto il testo del modello viene visualizzato senza eseguire HTML.

Verifica: `node --test tests/*.test.mjs` e `node scripts/build.mjs`. I test API utilizzano risposte simulate; una chiamata reale richiede una chiave e l’abilitazione web search. La cache PWA è aggiornata alla versione 10.

## Tema visivo

Interfaccia minimale in bianco caldo e carbone con accenti rossi, tipografia a matrice di punti e illustrazione SVG originale del pallone. Il font Doto è incluso localmente con licenza SIL Open Font License in `fonts/OFL.txt`, così il tema resta disponibile offline senza richieste a servizi di font esterni. Layout adattivo per desktop e smartphone, focus visibile e supporto alla preferenza di movimento ridotto.
