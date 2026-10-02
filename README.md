# FantaApp

Una piccola app statica per organizzare più squadre Fantacalcio, gestire le rose e ottenere un undici suggerito. Si apre direttamente in un browser e non richiede account, backend o dipendenze di build.

## Funzioni

- Crea più squadre, passa da una all'altra ed elimina quelle che non servono.
- Aggiungi o rimuovi giocatori, filtra la rosa per ruolo e segna le assenze.
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
