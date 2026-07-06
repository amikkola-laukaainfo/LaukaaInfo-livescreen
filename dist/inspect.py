import re, sys
sys.stdout.reconfigure(encoding='utf-8')

# Verify the fix
with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

arrows = re.findall(r'class="arrow">([^<]*)</span>', html)
print('Arrow spans:', [repr(a) for a in arrows[:10]])

# Verify style.css has-arrow
with open('style.css', 'r', encoding='utf-8') as f:
    css = f.read()

idx = css.find('has-arrow')
if idx > 0:
    print('\nhas-arrow CSS section:')
    print(css[idx-50:idx+200])
