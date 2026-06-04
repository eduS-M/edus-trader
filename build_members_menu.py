import os
import re
from collections import defaultdict
from datetime import datetime
import locale

# This script will scan bitacora/ and build the JS categories object for members/index.html
# Filename patterns:
# gameplan_DDMMM202X.html
# postmarket_DDMMM202X.html
# reporte_DDMMM202X.html or reporte_DDmesYYYY.html
# cierre...

months_map = {
    'ene': 1, 'feb': 2, 'mar': 3, 'abr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'ago': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dic': 12,
    'jan': 1, 'apr': 4, 'aug': 8, 'dec': 12
}

def parse_date(filename):
    # Regex to find something like 03JUN2026 or 15abr2026
    m = re.search(r'(\d{1,2})([a-zA-Z]{3})(\d{4})', filename)
    if m:
        day = int(m.group(1))
        month_str = m.group(2).lower()
        year = int(m.group(3))
        month = months_map.get(month_str, 1)
        return datetime(year, month, day)
    return None

files = os.listdir('bitacora')
entries = []

for f in files:
    if not f.endswith('.html'): continue
    dt = parse_date(f)
    if dt:
        
        label = ""
        if "gameplan" in f.lower():
            label = f"Día {dt.day} — Game Plan"
        elif "postmarket" in f.lower():
            label = f"Día {dt.day} — Post-Mercado"
        elif "cierresemanal" in f.lower():
            label = f"Día {dt.day} — Análisis Semanal"
        elif "cierremensual" in f.lower() or "cierre-de-mes" in f.lower():
            label = f"Día {dt.day} — Análisis Mensual"
        elif "reporte" in f.lower() or "analisis" in f.lower():
            label = f"Día {dt.day} — Análisis"
        else:
            label = f"Día {dt.day} — {f}"
        
        entries.append({
            'date': dt,
            'label': label,
            'url': f"/bitacora/{f}"
        })
    else:
        # Fallback for weird names like Premercado14-abril.html
        m = re.search(r'(\d{1,2})-([a-zA-Z]+)', f)
        if m:
            day = int(m.group(1))
            month_str = m.group(2).lower()[:3]
            month = months_map.get(month_str, 1)
            dt = datetime(2026, month, day)
            entries.append({
                'date': dt,
                'label': f"Día {day} — Premercado",
                'url': f"/bitacora/{f}"
            })

# Group by Month/Year
grouped = defaultdict(list)
for e in entries:
    month_key = e['date'].replace(day=1)
    grouped[month_key].append(e)

month_names = {
    1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril', 5: 'Mayo', 6: 'Junio',
    7: 'Julio', 8: 'Agosto', 9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
}

js_groups = []
# Sort months descending
for month_key in sorted(grouped.keys(), reverse=True):
    month_label = f"{month_names[month_key.month]} {month_key.year}"
    items = grouped[month_key]
    
    # Sort items by day descending, then Game Plan before Post-Mercado (alphabetically G before P)
    items.sort(key=lambda x: (x['date'].day, -ord(x['label'][x['label'].find('—')+2:x['label'].find('—')+3]) if '—' in x['label'] else 0), reverse=True)
    
    # Remove exact duplicate labels if any exist
    unique_items = []
    seen_labels = set()
    for item in items:
        # if multiple analysis for same day exist, keep them if URLs are different but let's just make sure label is unique
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

# Now replace in members/index.html
with open('members/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace HTML cards
# Find: <div class="mb-card c1" onclick="openModal('analisis')"> ... </div>
# Find: <div class="mb-card c3" onclick="openModal('gameplan')"> ... </div>
# Replace both with one card c1: bitacora

new_card = """      <div class="mb-card c1" onclick="openModal('bitacora')">
        <div class="mb-card-icon">📖</div>
        <div class="mb-card-title">Bitácora Operativa</div>
        <div class="mb-card-desc">Game Plans, Post-Markets y Reportes Diarios</div>
        <div class="mb-card-link">Ver contenido →</div>
      </div>"""

# Regex to remove card c1 and c3
content = re.sub(r'<div class="mb-card c1" onclick="openModal\(\'analisis\'\)[\s\S]*?</div>\s*</div>', new_card, content)
content = re.sub(r'<div class="mb-card c3" onclick="openModal\(\'gameplan\'\)[\s\S]*?</div>\s*</div>', '', content)

# Regex to remove analisis and gameplan from JS
# It looks like: analisis: { ... }, and gameplan: { ... },
# We can find categories = { ... }; and replace the whole block or just specific keys.
# Let's replace the whole categories object if possible, but we don't want to lose historicos, manuales, indicadores.
# It's safer to extract them.

historicos_m = re.search(r'historicos: \{[\s\S]*?\},[\s\n]*gameplan', content)
historicos_js = content[historicos_m.start():historicos_m.end()].replace(',\n      gameplan', '') if historicos_m else ""

manuales_m = re.search(r'manuales: \{[\s\S]*?\},[\s\n]*indicadores', content)
manuales_js = content[manuales_m.start():manuales_m.end()].replace(',\n      indicadores', '') if manuales_m else ""

indicadores_m = re.search(r'indicadores: \{[\s\S]*?\}[\s\n]*\};', content)
indicadores_js = content[indicadores_m.start():indicadores_m.end()].replace('\n    };', '') if indicadores_m else ""

categories_new = "var categories = {\n" + bitacora_js + "\n" + historicos_js + ",\n" + manuales_js + ",\n" + indicadores_js + "\n    };\n"

# Replace the categories object
content = re.sub(r'var categories = \{[\s\S]*?\n    \};', categories_new, content)

# Also fix the links in other sections just in case they were pointing to /gameplan etc
patterns = ['gameplan', 'postmarket', 'reporte', 'analisis', 'cierre', 'Premercado', 'edus-trader-dofa', 'edus_trader_gameplan', 'ana-backtesting']
for pat in patterns:
    # also handle href="file.html" instead of href="/file.html"
    content = re.sub(rf"url: '(/?)({pat}[^']+\.html)'", r"url: '/bitacora/\2'", content)

with open('members/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("members/index.html updated.")
