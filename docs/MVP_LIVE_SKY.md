# MVP Android — carta del cielo in tempo reale

## Flusso
All'avvio l'app richiede il permesso di posizione tramite il plugin ufficiale Tauri Geolocation, acquisisce le coordinate correnti e usa l'ora corrente. Mostra ruota zodiacale, Ascendente e posizioni geocentriche di Sole, Luna e pianeti. Aggiorna i calcoli ogni 30 secondi e consente il refresh manuale. Se il permesso viene negato o il GPS non è disponibile, l'utente può inserire latitudine e longitudine. Le coordinate rimangono in memoria: nessun account, archivio, sync, persistenza o chiamata server.

## Provider astronomico temporaneo
`SkyChartService` isola il provider per permettere la sostituzione senza cambiare la UI. La MVP usa Astronomy Engine 2.1.19 (MIT), con copyright/licenza riportati in `NOTICE`. Calcola posizioni geocentriche eclittiche della data; longitudini tropicali, case Whole Sign. L'Ascendente è ricavato da tempo siderale locale e obliquità vera della data. Questo è un prototipo da confrontare con fixture e software di riferimento, non una certificazione professionale.

Il repository VirgoStars-Ephemeris non espone ancora binding mobile stabili né un motore scientificamente convalidato per posizioni apparenti complete. La formula dell'Ascendente seleziona esplicitamente l'intersezione orientale fra orizzonte locale ed eclittica. Non si effettua una sostituzione prematura. Le librerie astrological-charts e astrological-functions non vengono copiate perché non risulta concessa una licenza pubblica per questo consumer.

## Geolocalizzazione e permessi
È integrato il plugin Tauri ufficiale `tauri-plugin-geolocation` / `@tauri-apps/plugin-geolocation` (versione 2.5.0). Il codice verifica lo stato del permesso, richiede `location` quando è in stato prompt e legge la posizione solo dopo il consenso. La capability autorizza esclusivamente check, request e get-current-position; non abilita il tracking continuo. Il plugin aggiunge i permessi Android coarse/fine al progetto nativo generato.

## Gate Android
- Eseguire `npm install`, `npm run check`, `npm run android:init`, `npm run android:dev` e `npm run android:build` con SDK/NDK/JDK configurati.
- Verificare prompt permesso, coordinate GPS, negazione/riabilitazione, modalità posizione approssimativa e fallback manuale su emulatore e telefono reale.
- Validare longitudini, case e ascendente su fixture riproducibili; confrontare con un software di riferimento prima della release.
- Non dichiarare motore VirgoStars integrato o calcolo certificato fino al superamento dei gate.
