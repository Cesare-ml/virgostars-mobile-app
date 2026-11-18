param(
  [string]$PacksDirectory = 'D:\VirgoStars-DE441-Mobile\packs',
  [switch]$CheckNativeProbe,
  [switch]$BuildAndroid
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$catalogPath = Join-Path $repo 'src\assets\de441-pack-catalog.json'
$catalog = Get-Content -LiteralPath $catalogPath -Raw | ConvertFrom-Json

if ($catalog.schema -ne 'virgostars.de441.pack-catalog.v1' -or $catalog.packs.Count -ne 10) {
  throw 'Catalogo DE441 inaspettato: interrompo il collaudo.'
}
if (-not (Test-Path -LiteralPath $PacksDirectory -PathType Container)) {
  throw "Cartella dei pacchetti non trovata: $PacksDirectory"
}

Write-Host 'Verifica dei dieci pacchetti locali DE441 (nessun download)...' -ForegroundColor Cyan
$count = 0
foreach ($pack in $catalog.packs) {
  $file = Join-Path $PacksDirectory $pack.filename
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Pacchetto mancante: $($pack.filename)"
  }
  $actualLength = (Get-Item -LiteralPath $file).Length
  if ($actualLength -ne $pack.bytes) {
    throw "Dimensione non corretta per $($pack.filename): $actualLength invece di $($pack.bytes)"
  }
  $hash = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $pack.sha256) {
    throw "SHA-256 non corrisponde per $($pack.filename)"
  }
  Write-Host ("OK: {0} ({1:N1} MB)" -f $pack.filename, ($pack.bytes / 1000000))
  $count++
}
Write-Host "Tutti i $count pacchetti validi." -ForegroundColor Green

Push-Location $repo
try {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'npm non trovato (installa Node.js).' }
  if (-not (Test-Path 'node_modules')) {
    Write-Host 'Dipendenze npm assenti, installazione lockfile...' -ForegroundColor Cyan
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci non riuscito; verifica le librerie sibling.' }
  }
  & npm run check
  if ($LASTEXITCODE -ne 0) { throw 'npm run check non riuscito.' }
  if ($CheckNativeProbe) {
    Write-Host 'Controllo compilazione Rust del lettore DE441 e conversione civile (senza scaricare kernels)...' -ForegroundColor Cyan
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
      throw 'cargo non trovato: installa Rust 1.90+ per controllare il lettore DE441.'
    }
    Push-Location (Join-Path $repo 'src-tauri')
    try {
      & cargo check --locked --features de441-native-probe
      if ($LASTEXITCODE -ne 0) { throw 'cargo check del lettore DE441 non riuscito.' }
    } finally {
      Pop-Location
    }
  }
  if ($BuildAndroid) {
    Write-Host 'Compilazione Android (richiede SDK/NDK/JDK/Rust configurati)...' -ForegroundColor Cyan
    if (-not (Test-Path 'src-tauri\gen\android')) {
      Write-Host 'Inizializzazione progetto Android locale...' -ForegroundColor Cyan
      & npm run android:init
      if ($LASTEXITCODE -ne 0) { throw 'Inizializzazione Android non riuscita.' }
    }
    & npm run android:build
    if ($LASTEXITCODE -ne 0) { throw 'Build Android non riuscita.' }
  }
} finally {
  Pop-Location
}
Write-Host 'Collaudo sorgenti completato. Il test di importazione sul dispositivo resta manuale.' -ForegroundColor Green
