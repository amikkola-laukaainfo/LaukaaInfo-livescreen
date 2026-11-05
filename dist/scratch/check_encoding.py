import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

root_dir = r"e:\matkalla\Projekteja\MUUTprojektit\LaukaaInfo-livescreen\LaukaaInfo-livescreen"
bad_patterns = ['Â', 'Ã', 'â', 'Ã¤', 'Ã¶', 'Ã„', 'Ã–', 'â€“', 'â€”', 'â‚¬', 'â­', 'Â–', 'Â»', 'Â«']

results = []
for dirpath, dirnames, filenames in os.walk(root_dir):
    if 'node_modules' in dirpath or '.git' in dirpath or 'scratch' in dirpath:
        continue
    for f in filenames:
        if f.endswith(('.html', '.js', '.json', '.css')):
            filepath = os.path.join(dirpath, f)
            try:
                with open(filepath, 'r', encoding='utf-8') as file:
                    lines = file.readlines()
                    for idx, line in enumerate(lines, 1):
                        for bp in bad_patterns:
                            if bp in line:
                                rel_path = os.path.relpath(filepath, root_dir)
                                results.append((rel_path, idx, bp, line.strip()[:140]))
                                break
            except Exception as e:
                pass

print(f"Total occurrences found: {len(results)}")
with open(r"scratch\encoding_results.txt", "w", encoding="utf-8") as out:
    out.write(f"Total occurrences found: {len(results)}\n")
    for r in results:
        out.write(f"{r[0]}:{r[1]} [{r[2]}] -> {r[3]}\n")

print("Written to scratch\\encoding_results.txt")
