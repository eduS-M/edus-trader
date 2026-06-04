import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# find the <div class="edus-list"> block
start_tag = '<div class="edus-list">'
end_tag = '</div>\n\n    <div class="edus-view-all">'

start_idx = content.find(start_tag)
end_idx = content.find(end_tag)

if start_idx == -1 or end_idx == -1:
    print("Could not find edus-list block")
    exit(1)

list_block = content[start_idx + len(start_tag):end_idx]

# We extract cards using regex
card_pattern = r'(<!-- \d{1,2} [A-Z]{3} \d{4} -->\s*<a class="edus-card" href="([^"]+)"[^>]*>.*?</a>)'
cards_found = re.findall(card_pattern, list_block, re.DOTALL)

unique_cards = {}
ordered_cards = []

for full_match, href in cards_found:
    if href not in unique_cards:
        unique_cards[href] = full_match
        ordered_cards.append(full_match)

final_cards = []
for card in ordered_cards[:9]:
    # Fix the href to prepend /bitacora/ if it doesn't have it
    card_updated = re.sub(r'href="/([^"]+)"', r'href="/bitacora/\1"', card)
    final_cards.append(card_updated)

new_list_block = "\n" + "\n".join(final_cards) + "\n    "
new_content = content[:start_idx + len(start_tag)] + new_list_block + content[end_idx:]

new_content = new_content.replace('últimos 5', 'últimos 9')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("index.html updated successfully with 9 unique records and new links.")
