"""Convert the supplied XLSX catalogs with Python's standard library.
Usage: python3 scripts/import-player-lists.py /path/to/fantamaster.xlsx /path/to/leghe.xlsx
Only allowlisted public player fields are emitted; league ownership/costs are excluded.
"""
import collections
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def rows(path):
    with zipfile.ZipFile(path) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = [''.join(node.itertext()) for node in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        for row in ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('s:sheetData/s:row', NS):
            result = {}
            for cell in row:
                value = cell.find('s:v', NS)
                inline = cell.find('s:is', NS)
                text = (value.text or '') if value is not None else ''.join(inline.itertext()) if inline is not None else ''
                result[''.join(filter(str.isalpha, cell.attrib['r']))] = strings[int(text)] if cell.get('t') == 's' else text
            yield result

def convert(source, path):
    players = []
    for row in rows(path):
        role = row.get('C' if source == 'fantamaster' else 'F')
        if role not in ('P', 'D', 'C', 'A'):
            continue
        name, club = (row['A'], row['B']) if source == 'fantamaster' else (row['B'], row['D'])
        if not name.strip() or not club.strip():
            raise ValueError('Missing name or club')
        identifier = hashlib.sha256((name + '\0' + club).encode()).hexdigest()[:16] if source == 'fantamaster' else row['A']
        player = {'id': source + ':' + identifier, 'name': name, 'club': club, 'role': role,
                  'quotation': float(row['D' if source == 'fantamaster' else 'L']),
                  'outOfList': bool(row.get('C')) if source == 'leghe' else False}
        if source == 'fantamaster':
            player['trequartista'] = row.get('E') == 'SI'
        else:
            player['mantraRoles'] = row.get('G', '')
        players.append(player)
    if not players or len({p['id'] for p in players}) != len(players):
        raise ValueError('Empty catalog or duplicate player IDs')
    return {'source': source, 'sourceFile': Path(path).name, 'players': players}

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    output = Path(__file__).resolve().parents[1] / 'data'
    output.mkdir(exist_ok=True)
    for source, path in zip(('fantamaster', 'leghe'), sys.argv[1:]):
        catalog = convert(source, path)
        (output / (source + '.json')).write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
        print(source, len(catalog['players']), 'players', dict(collections.Counter(p['role'] for p in catalog['players'])))
