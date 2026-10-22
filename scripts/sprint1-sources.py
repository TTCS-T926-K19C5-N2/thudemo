"""Read-only extraction of the approved workbook's scope and DoD."""
from pathlib import Path
import zipfile
import xml.etree.ElementTree as E

root = Path(__file__).resolve().parents[2]
path = next(root.glob('outputs/**/*đã đồng bộ refinement.xlsx'))
ns = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(path) as z:
    strings = []
    if 'xl/sharedStrings.xml' in z.namelist():
        strings = [''.join(t.itertext()) for t in E.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', ns)]
    book = E.fromstring(z.read('xl/workbook.xml'))
    rels = {r.attrib['Id']: r.attrib['Target'] for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    print('SOURCE', path)
    for sheet in book.find('m:sheets', ns):
        name = sheet.attrib['name']
        if name not in ['Backlog', 'DoD-DoR', 'K01']:
            continue
        target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
        print('SHEET', name)
        for row in E.fromstring(z.read(target)).findall('.//m:row', ns):
            vals = []
            for c in row.findall('m:c', ns):
                val = c.find('m:v', ns)
                text = val.text if val is not None else ''.join(c.find('m:is', ns).itertext()) if c.find('m:is', ns) is not None else ''
                if c.attrib.get('t') == 's': text = strings[int(text)]
                vals.append(c.attrib['r'] + '=' + (text or ''))
            line = ' | '.join(vals)
            if name != 'Backlog' or any('='+v+' |' in line for v in ['S-01', 'S-02', 'S-04', 'K-01']):
                print(line)
