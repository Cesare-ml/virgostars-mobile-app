"""Rebuild the GeoNames cities5000 derivative. Never downloads or overwrites files."""
import hashlib, json, pathlib, sys, zipfile

if len(sys.argv) != 3:
    raise SystemExit('Usage: python scripts/build-geonames.py cities5000.zip output.json')
source, target = map(pathlib.Path, sys.argv[1:])
expected = '8d6db49b852f8432aaa76c2ab8381085f67ef098a943a856827fd9daf9e63fb9'
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise SystemExit('Source snapshot hash differs; review and update provenance before rebuilding')
rows = []
with zipfile.ZipFile(source) as archive:
    for line in archive.open('cities5000.txt'):
        a = line.decode('utf-8').rstrip('\n').split('\t')
        if len(a) != 19 or not a[17]:
            continue
        aliases = [name for name in a[3].split(',') if 1 < len(name) <= 50][:150]
        rows.append([int(a[0]), a[1], a[2], round(float(a[4]), 6), round(float(a[5]), 6),
                     a[8], a[10], a[17], int(a[14] or 0), aliases])
rows.sort(key=lambda row: (-row[8], row[0]))
with target.open('x', encoding='utf-8', newline='') as out:
    json.dump(rows, out, ensure_ascii=False, separators=(',', ':'))
print('Wrote', len(rows), 'places to', target)