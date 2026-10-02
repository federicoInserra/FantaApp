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

## Importare una squadra tramite link

Dal menu dell’app installata scegli **Importa squadra**, incolla un link di importazione, visualizza l’anteprima e tocca **Aggiungi squadra**. Il link contiene nel frammento URL solo il nome, il listone e gli ID dei giocatori; i dati dei giocatori vengono risolti dal catalogo locale senza importare statistiche. Il roster personale non viene inserito nel repository. Chi riceve il link può leggerne il contenuto.

La squadra viene salvata solo nell’archivio del dispositivo dove confermi l’importazione. Per iPhone, incolla il link direttamente nell’app avviata dalla schermata Home: un’importazione in Safari può usare un archivio separato. Una seconda importazione dello stesso nome, listone e gruppo di giocatori non crea duplicati né sostituisce modifiche successive. Non è una sincronizzazione cloud.
