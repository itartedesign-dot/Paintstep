# Paintstep

Carica l'immagine di un dipinto (olio, acrilico o acquerello) e Paintstep lo scompone in **6–20 step** per ricrearlo, dal disegno preparatorio ai dettagli finali. Per ogni step mostra i colori da usare e, toccando un colore, la **miscela di colori primari** (in parti) per ottenere quella tinta.

L'app è statica: HTML, CSS e JavaScript, senza librerie e senza server. L'immagine viene elaborata interamente nel browser. Interfaccia disponibile in italiano, inglese, francese, spagnolo e tedesco.

## Come funziona

1. **Caricamento** – scegli l'immagine e la tecnica (acrilico, olio, acquerello) e i colori che hai a disposizione (solo primari, oppure primari + terre, rosso di cadmio e oltremare).
2. **Misure della tela** – facoltative. Se le proporzioni sono diverse dall'originale, puoi spostare e ingrandire il dipinto dentro la tela (trascinamento, rotellina, due dita o pulsanti): lo zoom è limitato in modo che la tela sia sempre piena, senza spazi vuoti.
3. **Analisi** – l'app misura la complessità del dipinto (densità dei contorni e varietà di colori) e decide il numero di step, da 6 a 20.
4. **Step**
   - *Step 1*: disegno preparatorio ricavato dai contorni dell'opera.
   - *Step successivi*: dalle grandi masse sfocate con pochi colori fino ai dettagli, aumentando via via il numero di tinte e la nitidezza. In ogni step vengono ridipinte solo le zone che cambiano davvero.
   - *Acquerello*: gli step procedono dal chiaro allo scuro, come nella tecnica reale a velature.
5. **Scheda colore** – per ogni tinta calcola la miscela con un modello di mescolanza sottrattiva (Kubelka–Munk), cercando la combinazione di 1–4 pigmenti più vicina, e mostra dove stenderla in quello step.

Ogni step mostra anche i pennelli consigliati (disegnati) e se lavorare con tela o carta bagnata o asciutta e con pennello umido o asciutto. Il tasto **Dividi opera** accanto al quadro mostra una croce (rossa, nera, bianca, gialla o verde) che divide l'opera in quattro parti uguali: toccando una parte si apre lo stesso step ingrandito su quella zona, con i suoi colori, e la freccia sotto riporta all'opera intera.

Comandi utili: frecce della tastiera o swipe sulla tela per cambiare step, "Mostra dove dipingere" per evidenziare le zone dello step, "Tieni premuto: originale" per confrontare con il dipinto.

## Pubblicarla su GitHub Pages

1. Crea un nuovo repository su GitHub, per esempio `paintstep`.
2. Carica i file `index.html`, `style.css`, `app.js`, `i18n.js` e `README.md` nella radice del repository (pulsante **Add file → Upload files**).
3. Vai in **Settings → Pages**, in *Build and deployment* scegli **Deploy from a branch**, branch `main`, cartella `/ (root)` e salva.
4. Dopo un minuto l'app sarà online su `https://TUO-UTENTE.github.io/paintstep/`.

Per provarla in locale basta aprire `index.html` nel browser.

## Personalizzare i colori

I pigmenti sono definiti in `app.js`, negli oggetti `BASE` (per tecnica) ed `EXTRA` (tavolozza estesa). Ogni pigmento ha un nome, un colore esadecimale e una forza tintoria (`str`): puoi aggiungere i colori delle tue marche preferite o regolarne la forza.

## Contatti e donazioni

In basso c'è una barra fissa con "Offrimi un caffè" (link PayPal per una donazione libera a buono.p@alice.it) e i crediti "App creata da Rein" con il modulo **Contatti**.

**Contatti.** Il modulo invia nome, email facoltativa e messaggio a itartedesign@gmail.com tramite il servizio gratuito [FormSubmit](https://formsubmit.co). Al **primo messaggio** FormSubmit manda a itartedesign@gmail.com un'email di attivazione: basta cliccare il link una volta e da lì in poi i messaggi arrivano direttamente. Dopo l'attivazione FormSubmit fornisce anche un codice alternativo da usare al posto dell'indirizzo, per non tenerlo visibile nel codice: si sostituisce in `app.js` nella costante `CONTACT_EMAIL`.

**PayPal.** Il pulsante apre la pagina di donazione PayPal per buono.p@alice.it (l'indirizzo deve essere collegato a un conto PayPal). Per aprire direttamente l'app PayPal sul telefono, crea un link personale su paypal.me e inseriscilo in `app.js` nella costante `PAYPAL_ME`.

## Testi e lingue

Tutti i testi sono in `i18n.js`, una sezione per lingua: puoi correggerli o aggiungere una lingua copiando una sezione esistente.

## Limiti

Paintstep è solo un'app di suggerimenti generati automaticamente e può sbagliare.

Le dosi sono indicative: i pigmenti reali cambiano da marca a marca e il modello di mescolanza è un'approssimazione. I colori molto scuri o molto saturi possono non essere raggiungibili con i soli primari: in quel caso la scheda lo segnala e conviene attivare la tavolozza estesa.
