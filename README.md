<div align="center">

# 🎨 Paintstep

### Any painting, step by step — like a real painter.

**[▶ Open the app — it's free](https://itartedesign-dot.github.io/Paintstep/)**

<img src="demo.gif" alt="Paintstep turns a painting into step-by-step painting instructions" width="360">

Free · Oil · Acrylic · Watercolor · 5 languages · No sign-up · Your image never leaves your device

[English](#english) · [Italiano](#italiano)

</div>

---

## English

Upload any painting (oil, acrylic or watercolor) and **Paintstep** turns it into **6–20 steps** that follow the method taught in art academies:

**drawing → toned ground → background → large darks → small darks → colors → lights → details → whites and highlights.**

For every step you get:

- 🖌️ **the colors to use**, and for each one the **mixing recipe** from primary colors (in parts), computed with a subtractive color-mixing model
- ✍️ **suggested brushes** (drawn) and whether to work **wet or dry**
- 🔍 **where to paint**, highlighted on the canvas
- ✂️ **"Split artwork"**: zoom into quarters (and quarters of quarters), swipe between them, compare with the original
- 🎬 **"Create my video"**: a ready-to-share vertical video of your painting coming to life (hook, "Start here" arrows, palette and color mixes, before/after). Add a photo of **your own finished painting** and it becomes the grand finale — "From the original to the result with Paintstep!" — with the link and a QR code. Perfect for Reels, TikTok and Shorts

**How it knows what to paint first.** You tap the main subject (smart selection + brush/eraser to refine) and, optionally, the secondary objects. Paintstep then paints the background first — behind the subject with acrylic, under its edges with oil, around it with watercolor — then the subjects, from darks to lights. If you skip, two small AI models running in your browser (Depth Anything V2 for depth, SegFormer for sky/water/subjects) do it automatically.

**Canvas size.** Enter your canvas size: if proportions differ, move and zoom the painting to fit.

**Privacy.** Everything runs in your browser. The image is never uploaded; only the AI models are downloaded once (≈ 30 MB) and cached.

> Paintstep gives automatically generated suggestions and can be wrong. Mixes depend on the brand and quality of your paints: use them as a starting point.

### Run it yourself
It's a static site: `index.html`, `style.css`, `app.js`, `i18n.js`. Host it on GitHub Pages (Settings → Pages → Deploy from branch `main`, folder `/root`) or open `index.html` locally (AI models only load from a web server).

### Contributing
Ideas, bug reports and translations are welcome — open an **Issue** or use the **Contact** form in the app. If you're a painter, tell us how you would change the step order: that's the most valuable feedback.

### Support
Paintstep is free and made with passion. If it helped you paint, you can [buy me a coffee ☕ on PayPal](https://www.paypal.com/donate/?business=buono.p%40alice.it&no_recurring=0&currency_code=EUR).

---

## Italiano

Carica l'immagine di un dipinto (olio, acrilico o acquerello) e Paintstep lo scompone in **6–20 step** per ricrearlo, dal disegno preparatorio ai dettagli finali. Per ogni step mostra i colori da usare e, toccando un colore, la **miscela di colori primari** (in parti) per ottenere quella tinta.

L'app è statica: HTML, CSS e JavaScript, senza librerie e senza server. L'immagine viene elaborata interamente nel browser. Interfaccia disponibile in italiano, inglese, francese, spagnolo e tedesco.

## Come funziona

1. **Caricamento** – scegli l'immagine, la tecnica (acrilico, olio, acquerello) e i colori che hai a disposizione.
2. **Misure della tela** – facoltative. Se le proporzioni sono diverse dall'originale, sposti e ingrandisci il dipinto dentro la tela: lo zoom è limitato in modo che la tela sia sempre piena.
3. **Soggetto e oggetti** – l'utente tocca il soggetto principale (tocco intelligente: l'app seleziona da sola le zone di colore simile; pennello e gomma per correggere, con annulla), poi, facoltativamente, gli oggetti secondari. Così l'app sa con certezza cosa è sfondo, cosa è oggetto e cosa è soggetto. Chi salta questo passaggio usa il riconoscimento automatico.
4. **Analisi della profondità** – l'app stima cosa sta davanti e cosa sta dietro con il modello di intelligenza artificiale *Depth Anything V2 Small*, che gira nel browser tramite Transformers.js. Il modello (circa 27 MB) **non è nel repository**: viene scaricato da Hugging Face alla prima analisi e poi resta in memoria nel browser. Se il download non riesce (rete assente o lenta, dispositivo non compatibile), l'app passa da sola al **metodo semplificato**, basato su posizione, dettaglio e saturazione delle zone. Sotto il quadro una nota indica quale metodo è stato usato.
5. **Riconoscimento degli elementi** – il modello *SegFormer B0* (NVIDIA, addestrato su ADE20K), anch'esso scaricato da Hugging Face alla prima analisi e poi tenuto in memoria, riconosce cielo, montagne, acqua, ambiente e soggetti (persone, animali, barche, oggetti di una natura morta). L'abbozzo segue così gli elementi veri, con step dai nomi chiari ("Abbozzo: cielo", "Abbozzo: acqua", "Abbozzo: soggetto", "Dettagli del soggetto") e pennellate orizzontali sull'acqua. Se il modello non è disponibile o non riconosce abbastanza elementi, l'app usa solo la profondità.
6. **Step (6–20)** – seguono il metodo del pittore, ragionando per valori (chiaro/scuro) e dimensione delle forme, stendendo **masse pulite** (forme compatte con bordi morbidi e una leggera trama) e lasciando pennellate e tocchi piccoli ai soli dettagli:
   - disegno preparatorio e, nei quadri più complessi, fondo tonale;
   - **sfondo** (cielo e zone lontane), che continua un po' sotto i soggetti;
   - **masse scure grandi**, poi **masse scure piccole**, con scuri colorati (blu oltremare, terra d'ombra), non con il nero;
   - **colori**: i mezzi toni con il colore locale, prima sfondo e oggetti poi il soggetto (o, senza selezione, prima le zone grandi e poi le piccole);
   - **chiari**, sopra i mezzi toni;
   - **rifinitura** di passaggi, bordi e dettagli;
   - **bianchi e luci massime**, per ultimi.
   - Acquerello, dal chiaro allo scuro: lavatura dello sfondo, velature chiare, colori e mezzi toni, scuri grandi e piccoli, rifinitura, scuri finali (i bianchi sono la carta, riservata fin dall'inizio).
7. **Scheda colore** – per ogni tinta calcola la miscela con un modello di mescolanza sottrattiva (Kubelka–Munk) e mostra dove stenderla in quello step.

Ogni step mostra i pennelli consigliati e se lavorare bagnato o asciutto. Le frecce **Precedente / Successivo** sono subito sotto il quadro. Il tasto **Dividi opera** divide il quadro in quattro parti: toccandone una si apre lo zoom di quella porzione (fino a due livelli, per esempio "Step 5 · Zoom 2.4"). In alto una miniatura dell'opera evidenzia in arancione la parte mostrata e si può toccare per spostarsi; scorrendo col dito sullo zoom si passa alle parti vicine. Un selettore mostra lo zoom dello step oppure la stessa porzione del quadro originale, per confrontarli. Sotto, le frecce riportano allo zoom di primo livello o direttamente allo step di partenza.

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

---

Made by **Rein** · [MIT License](LICENSE)
