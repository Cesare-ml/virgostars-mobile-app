"""Build the pinned CC BY 4.0 GeoNames cities1000 derivative; never downloads or overwrites."""
import hashlib, json, pathlib, sys, zipfile

if len(sys.argv) != 3:
    raise SystemExit('Usage: py scripts/build-geonames-1000.py cities1000.zip output.json')
source, target = map(pathlib.Path, sys.argv[1:])
expected = '3ecb9ec088363cf88153f4459d32a2843497dcf386af60585f98817650c1df65'
if hashlib.sha256(source.read_bytes()).hexdigest() != expected:
    raise SystemExit('Source snapshot hash differs; review provenance before rebuilding')
rows = []
with zipfile.ZipFile(source) as archive:
    for line in archive.open('cities1000.txt'):
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
