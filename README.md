# Anime Versus Game – lesbare Quellfassung

HTML beschreibt die Seite, CSS ihr Aussehen, JavaScript ihr Verhalten. Die Datei mit dem gesamten Spiel wurde deshalb in einzelne Verantwortungsbereiche zerlegt. Die Regeln und vorhandenen Spielmodi bleiben erhalten.

## Wo ändere ich was?

| Datei | Aufgabe |
| --- | --- |
| `public/index.html` | Grundgerüst der Seite und Einbindung der Dateien |
| `src/styles/game.css` | Farben, Layout, Animationen, mobile Darstellung |
| `src/client/bootstrap.js` | Einstieg und Wiederaufnahme eines Raums |
| `src/client/setup.js` | Startseite und Match-Einstellungen |
| `src/client/draft.js` | Picks, Wechsel, Joker, Trades, Captains und Aufstellung |
| `src/client/card-battle.js` | Interaktiver Kartenkampf; `cb` bedeutet „card battle“ |
| `src/client/hybrid-battle.js` | Klasse `HybridBattleDirector`: verdeckte Karten, Energie, vier Siege, kompakte Geschichten |
| `src/client/narration-player.js` | Klasse `NarrationPlayer`: ursprüngliche Browser-TTS mit Abbruchschutz |
| `src/client/result-sharing.js` | Scoregrafik, Bilddownload und eigenständiger Ergebnislink |
| `src/client/simulation.js` | Optionaler automatisch berechneter Kampf |
| `src/client/cinematic.js` | Kampfgeschichte, Sprachausgabe, Ergebnisse |
| `src/client/data/` | Figuren, Franchises und Fähigkeiten |
| `src/client/online-room-client.js` | Klasse `OnlineRoomClient`: Verbindung, Wiederverbindung, Bestätigungen |
| `src/client/lobby.js` | Raum erstellen, beitreten, Einladungen und Statusanzeigen |
| `src/client/state-codec.js` | Spielzustand für Übertragung und Speicherung umwandeln |
| `worker.mjs` | HTTP-Spielserver und Zugriff auf die Raumdatenbank |
| `db/schema.ts` | Beschreibung der Datenbanktabelle |
| `test/` | Tests für Übertragung, Sitzungen und ausgelieferte Dateien |

## Objektorientierung

`OnlineRoomClient` ist eine echte Klasse. Eine Instanz verwaltet einen Raum, seine Sitzung, Timer und noch nicht bestätigte Aktionen. Zustandslose Berechnungen bleiben Funktionen. Die bestehende Spiellogik verwendet teilweise gemeinsame Variablen; sie wurde nicht als vermeintlich vollständige OOP-Neuentwicklung ausgegeben.

`src/client-files.json` legt die Ladereihenfolge fest. Der Build kombiniert die lesbaren Dateien in ein Browser-Script. Dadurch funktionieren auch die bestehenden HTML-Button-Handler weiterhin. Dateien in `dist/` sind generiert; Änderungen gehören in die Quellen.

## Lokal starten

Voraussetzung: Node.js 24 und pnpm.

```sh
pnpm install
node build.mjs
node --test test/*.test.mjs
node preview.mjs
```

Danach `http://localhost:4173` öffnen. Der lokale Server speichert Räume in `.preview.sqlite`. Neue Builds werden ohne Serverneustart geladen. Die veröffentlichte Seite verwendet Cloudflare D1. Für zwei Spieler zwei getrennte Tabs öffnen und den Raumcode übernehmen. Lokale Räume funktionieren nur auf diesem Rechner; die Vorschau muss laufen. Sie sind von veröffentlichten Räumen getrennt.

## Gefundener Startfehler

Ein Build-Schritt verwendete einen JavaScript-String als `String.replace`-Ersetzung. Dabei wurde `$$` zu `$` verändert. Die ausgelieferte Seite enthielt anschließend doppelte Deklarationen und blieb leer. Eine Callback-Ersetzung bewahrt den Text unverändert. `test/delivery.test.mjs` vergleicht jetzt die tatsächlich vom Worker ausgelieferten Bytes mit den Quellen und prüft den ausgelieferten JavaScript-Code.

## Online-Verhalten

Der Host ist für Spielentscheidungen zuständig. Der Server überträgt seinen Zustand und speichert eine ausstehende Gastaktion. Aktionen tragen eine eindeutige ID und werden erst nach Bestätigung entfernt. Antworten aus alten Sitzungen werden verworfen. Ein Raum hat zwei feste Plätze und läuft sechs Stunden nach dem letzten Host-Kontakt ab. Beide Spieler müssen ihre Tabs offen halten.

Die private Vorschau ist nur für den Eigentümer freigegeben. Eine öffentliche Freigabe für Freunde ist eine getrennte Einstellung. Die bestehende GitHub-Pages-Seite wurde nicht automatisch ersetzt.

## Erzählung und optionale KI

Der Standardkampf verwendet vier Karten und endet bei vier Duellsiegen. Karten verändern die Siegchance; Figuren, Synergie und Arena bleiben relevant. Der Live-Text besteht aus wenigen konkreten Fähigkeitsaktionen. Die vollständige ursprüngliche Geschichte bleibt aufklappbar. Die Web-Speech-Engine, Stimmenauswahl und gespeicherte Sprechgeschwindigkeit aus der Originaldatei bleiben erhalten.

Puter bleibt optional, ist zunächst ausgeschaltet und öffnet nur über den ausdrücklichen Aktivieren-Button eine Anmeldung. Eine KI-Langfassung kann im aufgeklappten Kampfbericht angefordert werden; Fehler blockieren das Match nicht. TTS und lokale Geschichten benötigen keinen KI-Login. Die Qualität und Verfügbarkeit der Browser-Stimmen hängen vom Gerät ab.

Recherche: [Puter-Sicherheitsmodell](https://docs.puter.com/security/) erklärt die automatische Anmeldung beim Cloudzugriff. [WebLLM](https://webllm.mlc.ai/docs/user/get_started.html) ist eine mögliche lokale Alternative ohne Konto, benötigt jedoch WebGPU und Modelldaten; deshalb wurde es nicht als Voraussetzung eingebaut.

## Teilen

„Ergebnis teilen“ erstellt eine PNG-Grafik mit Score, Sieger, MVP und beiden Teams. Native Bildfreigabe hängt vom Browser ab; Download und kopierbarer Ergebnislink bleiben verfügbar. Der Link enthält den Ergebnisstand und funktioniert ohne den ursprünglichen Raum. Er ist ein teilbarer Spielbericht, kein fälschungssicherer Ranglistennachweis.
