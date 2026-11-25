"""Anonymous public checks: no auth headers, cookies or protection bypass."""
import json
from pathlib import Path
import urllib.request

base = 'https://studyhub-vq8j.vercel.app'
results = []
for route, expected in [('/lead-gen/privacy/', 'Lead-Gen-system privacy policy'),
                        ('/lead-gen/data-deletion/', 'Request deletion from Lead-Gen-system')]:
    with urllib.request.urlopen(base + route, timeout=25) as response:
        body = response.read().decode('utf-8')
        results.append({'url': base + route, 'status': response.status,
                        'final_url': response.url, 'expected_content': expected in body,
                        'contact_present': 'mohmmadfahad53408@gmail.com' in body,
                        'login_redirect': 'login' in response.url})
Path('.local/policy-pages-public-verification.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results))
assert all(row['status'] == 200 and row['expected_content'] and row['contact_present']
           and not row['login_redirect'] for row in results)
