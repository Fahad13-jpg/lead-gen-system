# Search city suggestions

search-cities.json is a Pakistan/United States subset of GeoNames cities1000 and admin1CodesASCII, downloaded 20 November 2026 from https://download.geonames.org/export/dump/.

Each row is [GeoNames ID, ASCII city name, administrative region, country code, population]. Rows are ordered by population to rank common matches. Identical city names remain separate by ID and region.

GeoNames data is licensed under Creative Commons Attribution 4.0: https://creativecommons.org/licenses/by/4.0/. Attribution: GeoNames, https://www.geonames.org/. This derived subset filters countries and fields; it does not verify an entered address or scraping coverage. Smaller/unlisted locations remain available through explicit custom-area confirmation.

The local dataset makes no lookup requests and incurs no provider fees. Refresh with scripts/data/import-search-cities.py. All matching runs in the browser only on the search route.
