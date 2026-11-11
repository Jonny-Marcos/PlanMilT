const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

global.window = {};
require('../../js/features/geojson-serialization.js');
const serialize = window.PlanMilT.geoJsonSerialization.toFeatureCollection;

function layer(feature) {
    return { toGeoJSON: () => feature };
}

function group(children, feature) {
    return {
        feature,
        eachLayer(callback) { children.forEach(callback); },
        toGeoJSON(precision) {
            const features = [];
            this.eachLayer(child => {
                if (!child.toGeoJSON) return;
                const result = child.toGeoJSON(precision);
                if (result.type === 'FeatureCollection') features.push.apply(features, result.features);
                else features.push(result);
            });
            return { type: 'FeatureCollection', features };
        }
    };
}

test('serializes a coverage with 200,000 cells without the Leaflet argument limit', () => {
    const sharedGeometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const cells = Array.from({ length: 200000 }, (_, index) => layer({
        type: 'Feature',
        properties: { color: '#ff0000', rxPower: String(index) },
        geometry: sharedGeometry
    }));
    const drawing = group([group(cells)]);
    assert.throws(() => drawing.toGeoJSON(), RangeError);
    const result = serialize(drawing);
    assert.equal(result.type, 'FeatureCollection');
    assert.equal(result.features.length, 200000);
    assert.equal(result.features[0].properties.rxPower, '0');
    assert.equal(result.features[199999].properties.rxPower, '199999');
    assert.deepEqual(JSON.parse(JSON.stringify(result.features[0])), cells[0].toGeoJSON());
});

test('preserves order, precision, special geometries, raw geometries and nonserializable layers', () => {
    let receivedPrecision;
    const first = { type: 'Feature', properties: { color: '#123456' }, geometry: { type: 'Point', coordinates: [1, 2] } };
    const special = { type: 'Feature', properties: { name: 'grupo' }, geometry: { type: 'GeometryCollection', geometries: [] } };
    const specialGroup = {
        feature: special,
        eachLayer() { throw new Error('Special geometries must not be flattened'); },
        toGeoJSON(precision) { receivedPrecision = precision; return special; }
    };
    const multiPoint = {
        feature: { geometry: { type: 'MultiPoint' } },
        eachLayer() { throw new Error('MultiPoint must not be flattened'); },
        toGeoJSON: () => ({ type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates: [[3, 4]] } })
    };
    const raw = { type: 'Point', coordinates: [5, 6] };
    const result = serialize(group([layer(first), {}, group([specialGroup, multiPoint, layer(raw)])]), 4);
    assert.equal(receivedPrecision, 4);
    assert.deepEqual(result.features, [first, special, multiPoint.toGeoJSON(), { type: 'Feature', properties: {}, geometry: raw }]);
});

test('save and export use the shared serializer, which loads before consumers', () => {
    const root = path.join(__dirname, '../..');
    const read = file => fs.readFileSync(path.join(root, file), 'utf8');
    const html = read('index.html');
    assert.ok(html.indexOf('geojson-serialization.js') < html.indexOf('kmz-export.js'));
    for (const file of ['js/features/drawing-storage.js', 'js/features/kmz-export.js', 'js/features/help-and-planning.js']) {
        assert.match(read(file), /geoJsonSerialization\.toFeatureCollection/);
    }
});
