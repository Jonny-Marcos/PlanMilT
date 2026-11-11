const assert = require('node:assert/strict');
const test = require('node:test');

global.window = global;
global.screen = {};
global.document = {
    documentElement: { style: {} },
    createElement: () => ({ getContext: () => ({}), style: {} })
};
const L = require('../../js/library/leaflet.js');
require('../../js/features/geojson-serialization.js');

test('real Leaflet groups with 150,000 features serialize without exceeding the call stack', () => {
    const coverage = L.layerGroup();
    for (let index = 0; index < 150000; index++) {
        coverage.addLayer({
            toGeoJSON() {
                return {
                    type: 'Feature',
                    properties: { rxPower: index },
                    geometry: { type: 'Point', coordinates: [0, 0] }
                };
            }
        });
    }
    const drawnItems = L.featureGroup([coverage]);
    assert.throws(() => drawnItems.toGeoJSON(), RangeError);
    const output = window.PlanMilT.geoJsonSerialization.toFeatureCollection(drawnItems);
    assert.equal(output.features.length, 150000);
    assert.equal(output.features[0].properties.rxPower, 0);
    assert.equal(output.features[149999].properties.rxPower, 149999);
});
