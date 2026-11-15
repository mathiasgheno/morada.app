import json
import sys
import time
from pathlib import Path
import osmium

started = time.perf_counter()
bounds = [-47.2, -24.2, -46.0, -23.1]


def category(tags):
    if tags.get('shop') == 'bakery':
        return 'bakery'
    if tags.get('leisure') == 'fitness_centre' or tags.get('sport') == 'fitness':
        return 'gym'
    if tags.get('amenity') == 'pharmacy' or tags.get('shop') == 'chemist':
        return 'pharmacy'
    if tags.get('shop') in ('supermarket', 'convenience', 'grocery'):
        return 'market'
    if tags.get('leisure') == 'park':
        return 'park'


class Extractor(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.items = {}

    def save(self, identifier, tags, points):
        kind = category(tags)
        if not kind or not points:
            return
        longitude = (min(point[0] for point in points) + max(point[0] for point in points)) / 2
        latitude = (min(point[1] for point in points) + max(point[1] for point in points)) / 2
        if not (bounds[0] <= longitude <= bounds[2] and bounds[1] <= latitude <= bounds[3]):
            return
        hours = tags.get('opening_hours')
        self.items[identifier] = dict(id=identifier, category=kind, name=tags.get('name', kind), lat=latitude, lng=longitude,
                                      openingHours=hours, is24Hours=True if hours and hours.strip() == '24/7' else None)

    def node(self, node):
        if category(node.tags) and node.location.valid():
            self.save(f'node/{node.id}', node.tags, [(node.location.lon, node.location.lat)])

    def way(self, way):
        if category(way.tags):
            self.save(f'way/{way.id}', way.tags, [(node.lon, node.lat) for node in way.nodes if node.location.valid()])

    def area(self, area):
        if not area.from_way() and category(area.tags):
            points = [(node.lon, node.lat) for ring in area.outer_rings() for node in ring if node.location.valid()]
            self.save(f'relation/{area.orig_id()}', area.tags, points)


extractor = Extractor()
extractor.apply_file(sys.argv[1], locations=True, idx='flex_mem')
result = dict(source='OpenStreetMap / Geofabrik Sudeste', license='ODbL-1.0', bounds=bounds,
              generatedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), items=list(extractor.items.values()))
output = Path(sys.argv[2] if len(sys.argv) > 2 else 'estabelecimentos-locais.json')
temporary = output.with_suffix('.tmp')
temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
temporary.replace(output)
print(f'{len(extractor.items)} estabelecimentos; {output.stat().st_size / 1024 / 1024:.2f} MB; {time.perf_counter() - started:.1f}s', flush=True)
