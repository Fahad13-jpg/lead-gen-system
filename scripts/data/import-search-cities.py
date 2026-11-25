import urllib.request, zipfile, io, json
from pathlib import Path
base='https://download.geonames.org/export/dump/'
with urllib.request.urlopen(base+'cities1000.zip',timeout=40) as r: raw=r.read()
with urllib.request.urlopen(base+'admin1CodesASCII.txt',timeout=25) as r: regions={p[0]:p[2] for line in r.read().decode().splitlines() if len(p:=line.split('\t'))>=3}
z=zipfile.ZipFile(io.BytesIO(raw)); rows=[]
for line in z.read('cities1000.txt').decode().splitlines():
 p=line.split('\t')
 if p[8] in ('PK','US'): rows.append([p[0],p[2],regions.get(p[8]+'.'+p[10],p[10]),p[8],int(p[14] or 0)])
rows.sort(key=lambda r:-r[4])
out=Path('dashboard/src/data');out.mkdir(exist_ok=True)
(out/'search-cities.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(json.dumps({'cities':len(rows),'bytes':(out/'search-cities.json').stat().st_size}))
