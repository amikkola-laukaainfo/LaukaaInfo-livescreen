import json

with open('company_profiling_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for company_id, company_data in data.items():
    if 'Mediazoo' in str(company_data):
        print(json.dumps({company_id: company_data}, indent=2, ensure_ascii=False))
