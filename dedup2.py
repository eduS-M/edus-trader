import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern captures one card, matches consecutive duplicates and replaces with just one
pattern = re.compile(r'(      <!-- 04 Jun 2026 -->\n      <a class="edus-card" href="/bitacora/postmarket_04JUN2026\.html".*?      </a>\n)+', re.DOTALL)

new_content = pattern.sub(r'\1', content)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Deduplicated index.html")
