import os
import re
import calendar
from collections import defaultdict
from datetime import datetime

months_map = {
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12,
    'jan': 1, 'apr': 4, 'aug': 8, 'dec': 12
}

def parse_date(filename):
    m = re.search(r'(\d{1,2})([a-zA-Z]{3})(\d{4})', filename)
    if m:
        day = int(m.group(1))
        month_str = m.group(2).lower()
        year = int(m.group(3))
        month = months_map.get(month_str, 1)
        return datetime(year, month, day)
    
    m2 = re.search(r'([a-zA-Z]{3})(\d{4})', filename)
    if m2:
        month_str = m2.group(1).lower()
        year = int(m2.group(2))
        month = months_map.get(month_str, 1)
        last_day = calendar.monthrange(year, month)[1]
        return datetime(year, month, last_day)

    return None

files = os.listdir('bitacora')
entries = []

for f in files:
    if not f.endswith('.html'): continue
    dt = parse_date(f)
    if dt:
        label = ""
        sort_order = 9
        if "cierremensual" in f.lower() or "cierre-de-mes" in f.lower():
            month_names_es = {
                1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
                7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
            }
            label = f"Análisis Mensual {month_names_es[dt.month]} {dt.year}"
            sort_order = 1
        elif "cierresemanal" in f.lower():
            label = f"Día {dt.day} — Análisis Semanal"
            sort_order = 2
        elif "postmarket" in f.lower():
            label = f"Día {dt.day} — Post-Mercado"
            sort_order = 3
        elif "gameplan" in f.lower():
            label = f"Día {dt.day} — Game Plan"
            sort_order = 4
        elif "reporte" in f.lower() or "analisis" in f.lower():
            label = f"Día {dt.day} — Análisis"
            sort_order = 5
        else:
            label = f"Día {dt.day} — {f}"
            sort_order = 6
        
        entries.append({
            'date': dt,
            'label': label,
            'url': f"/bitacora/{f}",
            'sort_order': sort_order
        })
    else:
        m = re.search(r'(\d{1,2})-([a-zA-Z]+)', f)
        if m:
            day = int(m.group(1))
            month_str = m.group(2).lower()[:3]
            month = months_map.get(month_str, 1)
            dt = datetime(2026, month, day)
            entries.append({
                'date': dt,
                'label': f"Día {day} — Premercado",
                'url': f"/bitacora/{f}",
                'sort_order': 7
            })

grouped = defaultdict(list)
for e in entries:
    month_key = e['date'].replace(day=1)
    grouped[month_key].append(e)

month_names = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
}

js_groups = []
for month_key in sorted(grouped.keys(), reverse=True):
    month_label = f"{month_names[month_key.month]} {month_key.year}"
    items = grouped[month_key]
    
    items.sort(key=lambda x: (x['date'].day, -x['sort_order']), reverse=True)
    
    unique_items = []
    seen_labels = set()
    for item in items:
        if item['label'] not in seen_labels:
            seen_labels.add(item['label'])
            unique_items.append(item)
    
    items_js = ",\n              ".join([f"{{ label: '{i['label']}', url: '{i['url']}' }}" for i in unique_items])
    group_str = f"""          {{
            label: '{month_label}', items: [
              {items_js}
            ]
          }}"""
    js_groups.append(group_str)

bitacora_js = f"""      bitacora: {{
        icon: '📖',
        title: 'Bitácora Operativa',
        groups: [
{",\n".join(js_groups)}
        ]
      }},"""

with open('members/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

historicos_js = ""
manuales_js = ""

hm = re.search(r'historicos: \{[\s\S]*?\},[\s\n]*manuales', content)
if hm:
    historicos_js = content[hm.start():hm.end()].replace(',\nmanuales', '').replace(',\n      manuales', '').strip()

mm = re.search(r'manuales: \{[\s\S]*?\}[\s\n]*,?[\s\n]*};', content)
if mm:
    manuales_js = content[mm.start():mm.end()].replace('\n    };', '').replace('\n};', '').strip()

if manuales_js.endswith(','): manuales_js = manuales_js[:-1]
if historicos_js.endswith(','): historicos_js = historicos_js[:-1]

indicadores_js = """      indicadores: {
        icon: '📺',
        title: 'Indicadores',
        groups: [
          {
            label: null, items: [
              { label: 'Repositorio NT8', url: '/repositorio-NT8.html' },
              { label: 'EduS Index Dashboard', url: 'https://edus-trader.onrender.com', external: true },
            ]
          },
        ]
      }"""

categories_new = "var categories = {\n" + bitacora_js + "\n      " + historicos_js + ",\n      " + manuales_js + ",\n" + indicadores_js + "\n    };\n"

content = re.sub(r'var categories = \{[\s\S]*?\n    \};', categories_new, content)

with open('members/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("members/index.html updated successfully.")
