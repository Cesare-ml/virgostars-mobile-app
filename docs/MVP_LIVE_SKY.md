# MVP Android — carta del cielo in tempo reale

## Flusso
All'avvio l'app richiede la posizione del dispositivo, usa l'ora corrente e mostra la carta del cielo. Aggiorna i calcoli ogni 30 secondi; il pulsante consente il refresh manuale. In caso di rifiuto/errore GPS o su browser senza geolocalizzazione, l'utente può inserire latitudine e longitudine. Le coordinate restano solo in memoria: nessun account, archivio, sync, persistenza o chiamata server.

## Provider astronomico temporaneo
`SkyChartService` isola il provider per permettere la sostituzione senza cambiare la UI. La MVP usa Astronomy Engine 2.1.19 (MIT), con copyright/licenza riportati in `NOTICE`. Calcola posizioni geocentriche eclittiche della data. Longitudini tropicali; case Whole Sign. L'Ascendente è ricavato da tempo siderale locale e obliquità vera della data. Questo è un prototipo da confrontare con fixture e software di riferimento, non una certificazione professionale.

Il repository VirgoStars-Ephemeris non espone ancora binding mobile stabili né un motore scientificamente convalidato per le posizioni apparenti complete. Non si effettua una sostituzione prematura. Le librerie astrological-charts e astrological-functions non vengono copiate perché non risulta concessa una licenza pubblica per questo consumer.

## Gate Android
- Eseguire `npm install`, `npm run check`, `npm run android:init`, `npm run android:dev` e `npm run android:build` con SDK/NDK/JDK configurati.
- Verificare la richiesta del permesso GPS nella Tauri Android WebView. Se la geolocalizzazione web non viene concessa dal WebChromeClient, aggiungere un bridge nativo minimo e permission prompt Android esplicito prima di considerare completata la UX GPS.
- Testare emulatore e dispositivo fisico; permesso e comportamento WebView non sono ancora verificati.
- Validare posizioni, case e ascendente su fixture riproducibili prima della release. Non dichiarare il motore VirgoStars integrato fino al superamento dei gate.
