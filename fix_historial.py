import re

with open('historial.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace href="/gameplan... to href="/bitacora/gameplan...
patterns = ['gameplan', 'postmarket', 'reporte', 'analisis', 'cierre', 'Premercado', 'edus-trader-dofa', 'edus_trader_gameplan', 'ana-backtesting']

for pat in patterns:
    # also handle href="file.html" instead of href="/file.html"
    content = re.sub(rf'href="/({pat}[^"]+\.html)"', r'href="/bitacora/\1"', content)
    content = re.sub(rf'href="({pat}[^"]+\.html)"', r'href="/bitacora/\1"', content)

with open('historial.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("historial.html updated.")
