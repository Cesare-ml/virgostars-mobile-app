# Desktop city catalog on Android

The Android app packages and searches the desktop v2 SQLite catalog offline. The local source is `../virgostars-desktop/.local/places/world-cities.sqlite` or the file selected by `VIRGOSTARS_CITY_CATALOG`. `npm run prepare:places` verifies its size (196,808,704 bytes) and SHA-256 (`605f0d0e3646812b3aaa4acd8b895dd462b10b58d986df1c2e4ca1a486c7457a`), then stages a verified copy in ignored `.local/places`. The database is not checked into Git. It contains 1,951,599 places according to the desktop manifest. A different catalog version requires an explicit reviewed checksum and schema update.

On first Android search the bundled asset is streamed into private app storage and checked against the same digest before use. Subsequent searches use read-only SQLite and FTS5 in a blocking worker; only bounded results cross the native bridge. Search accepts a city and optional region and country, including ISO codes and localized Italian or English country names. Coordinates and IANA zone remain editable; historical time-zone accuracy is not established by the catalog. If the database is unavailable, manual entry remains possible. First use needs extra storage approximately equal to the uncompressed database in addition to the installed package. Search queries remain on device.

Search requests are serialized and pending requests coalesced so typing while a prior query or catalog installation is running does not exhaust native query slots. `Portomaggiore` was confirmed in both the desktop source and the native search on a connected Pixel 8 Pro.

On 2026-11-18, a debug build on that Pixel also returned Portomaggiore in the app UI after successive prefix searches. This checks that case, not completeness or every locality.

The desktop search and response-validation code informs this implementation and remains under its original CPAL-1.0 terms. Database rights are separate from code licensing. This local integration does not publish or redistribute any artifact. iOS and non-Android native search have not been implemented or tested; browser preview deliberately has no city-search fallback.

## Local verification — 2026-11-18

An Android x86_64 debug APK included the pinned database. On an Android 36.1 emulator, the first search for `Landriano, Italia` installed the database and populated coordinates and `Europe/Rome`. After restarting the app, `Curiglia con Monteviasco, Italia` also returned and populated its fields; this locality was absent from the previous reduced snapshot. These were WebView-driven emulator checks, not physical-device, iOS, performance or release tests. The Chromium smoke uses fictional native responses to exercise stale results and unavailable-catalog handling.
