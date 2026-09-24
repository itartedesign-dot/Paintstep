# Paintstep

Carica l'immagine di un dipinto (olio, acrilico o acquerello) e Paintstep lo scompone in **6–20 step** per ricrearlo, dal disegno preparatorio ai dettagli finali. Per ogni step mostra i colori da usare e, toccando un colore, la **miscela di colori primari** (in parti) per ottenere quella tinta.

L'app è statica: HTML, CSS e JavaScript, senza librerie e senza server. L'immagine viene elaborata interamente nel browser. Interfaccia disponibile in italiano, inglese, francese, spagnolo e tedesco.

## Come funziona

1. **Caricamento** – scegli l'immagine, la tecnica (acrilico, olio, acquerello) e i colori che hai a disposizione.
2. **Misure della tela** – facoltative. Se le proporzioni sono diverse dall'originale, sposti e ingrandisci il dipinto dentro la tela: lo zoom è limitato in modo che la tela sia sempre piena.
3. **Analisi della profondità** – l'app stima cosa sta davanti e cosa sta dietro con il modello di intelligenza artificiale *Depth Anything V2 Small*, che gira nel browser tramite Transformers.js. Il modello (circa 27 MB) **non è nel repository**: viene scaricato da Hugging Face alla prima analisi e poi resta in memoria nel browser. Se il download non riesce (rete assente o lenta, dispositivo non compatibile), l'app passa da sola al **metodo semplificato**, basato su posizione, dettaglio e saturazione delle zone. Sotto il quadro una nota indica quale metodo è stato usato.
4. **Step (6–20)** – costruiti come strati di pittura veri, con pennellate simulate che seguono le forme:
   - disegno preparatorio;
   - fondo tonale (olio e acrilico, nei quadri più complessi);
   - abbozzo per zone, dal fondo al primo piano, con pennelli larghi;
   - ombre e mezzi toni, poi luci (acquerello: prima i mezzi toni, poi le ombre, lasciando bianca la carta dove servono le luci);
   - dettagli, dal lontano al vicino;
   - luci finali e ritocchi.
5. **Scheda colore** – per ogni tinta calcola la miscela con un modello di mescolanza sottrattiva (Kubelka–Munk) e mostra dove stenderla in quello step.

Ogni step mostra i pennelli consigliati e se lavorare bagnato o asciutto. Le frecce **Precedente / Successivo** sono subito sotto il quadro. Il tasto **Dividi opera** mostra una croce colorata che divide l'opera in quattro parti: toccando una parte si apre lo stesso step ingrandito, e la freccia centrale riporta all'opera intera.

L'immagine del dipinto non lascia mai il dispositivo: dall'esterno si scaricano solo la libreria e il modello.

## Contatti e donazioni

In basso c'è una barra fissa con "Offrimi un caffè" (link PayPal per una donazione libera a buono.p@alice.it) e i crediti "App creata da Rein" con il modulo **Contatti**.

**Contatti.** Il modulo invia nome, email facoltativa e messaggio a itartedesign@gmail.com tramite il servizio gratuito [FormSubmit](https://formsubmit.co). Al **primo messaggio** FormSubmit manda a itartedesign@gmail.com un'email di attivazione: basta cliccare il link una volta e da lì in poi i messaggi arrivano direttamente. Dopo l'attivazione FormSubmit fornisce anche un codice alternativo da usare al posto dell'indirizzo, per non tenerlo visibile nel codice: si sostituisce in `app.js` nella costante `CONTACT_EMAIL`.

**PayPal.** Il pulsante apre la pagina di donazione PayPal per buono.p@alice.it (l'indirizzo deve essere collegato a un conto PayPal). Per aprire direttamente l'app PayPal sul telefono, crea un link personale su paypal.me e inseriscilo in `app.js` nella costante `PAYPAL_ME`.

## Testi e lingue

Tutti i testi sono in `i18n.js`, una sezione per lingua: puoi correggerli o aggiungere una lingua copiando una sezione esistente.

## Limiti

Paintstep è solo un'app di suggerimenti generati automaticamente e può sbagliare.

Le dosi sono indicative: i pigmenti reali cambiano da marca a marca e il modello di mescolanza è un'approssimazione. I colori molto scuri o molto saturi possono non essere raggiungibili con i soli primari: in quel caso la scheda lo segnala e conviene attivare la tavolozza estesa.
