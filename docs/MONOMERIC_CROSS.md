# Croce monomerica — integrazione mobile (prototype)

Su un tema realmente calcolato, il selettore **Carta / Croce monomerica**
mostra il componente di `astrological-charts` con quattro schede in colonna
su schermi stretti. Il calcolo geometrico usa
`astrological-functions/monomeric-cross`, longitudini e cuspidi già presenti
nel risultato; il sistema di case selezionato viene rispettato.

Non vengono salvati o trasmessi dati del tema. Il Maestro dell'Ora è ancora
un input **manuale esplicito**, perché il client non ha un provider validato
di alba/tramonto e ora planetaria. Le descrizioni storiche restano vuote
finché l'indice e i diritti del corpus del Serto di Iside non sono convalidati.

QA rimanente: build Android nativa e screenshot reali su schermi compatti,
accessibilità touch / TalkBack, tema scuro, testi lunghi e fallback polare;
integrazione futura del resolver dell'ora e del catalogo. Non modificare
autenticazione, archiviazione, IPC o ephemeris per questa vista.
