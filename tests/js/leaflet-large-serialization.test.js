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
require('../../js/features/tactical-graphics.js');
window.PlanMilT.localHistory = { graphics: () => [], recordGraphic() {} };

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

test('real Leaflet preserves editable boundary geometry and its repeated annotations', () => {
    let zoom = 12;
    const map = new L.Evented();
    map.hasLayer = () => false;
    map.project = latlng => L.CRS.EPSG3857.latLngToPoint(L.latLng(latlng), zoom);
    map.unproject = point => L.CRS.EPSG3857.pointToLatLng(L.point(point), zoom);
    const drawnItems = L.featureGroup();
    const integration = window.PlanMilT.tacticalGraphics.attach({
        map, leaflet: L, library: {}, catalog: {}, drawnItems,
        button: { addEventListener() {} }, sweetAlert: {}, getDefaultColor: () => '#123456'
    });
    const feature = {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[-50, -20], [-49.9, -20]] },
        properties: { role: 'graphic', color: '#123456', boundaryId: 'limit',
            tacticalGraphic: { name: 'Boundary', boundary: { type: 'Pelotão', leftText: 'A', rightText: 'B', count: 2 } } }
    };
    const line = L.geoJSON(feature).getLayers()[0];
    integration.registerBoundaryLayer(line, true);
    drawnItems.addLayer(line);
    line.fire('add');
    integration.refreshBoundary(line);
    const saved = window.PlanMilT.geoJsonSerialization.toFeatureCollection(drawnItems, false);
    assert.deepEqual(saved.features[0].geometry, feature.geometry);
    assert.equal(saved.features.filter(item => item.properties.role === 'boundaryMark').length, 2);
    assert.equal(saved.features.filter(item => item.properties.role === 'boundaryLabel').length, 4);
    assert.equal(saved.features[0].properties.tacticalGraphic.boundary.count, 2);
    assert.equal(line.options.noClip, true);
    assert.equal(line.options.lineCap, 'butt');
    const originalDash = line.options.dashArray;
    zoom = 13;
    map.fire('zoomend');
    assert.notEqual(line.options.dashArray, originalDash);
});

test('real Leaflet converts an existing polyline without rounding its coordinates', async () => {
    let zoom = 12;
    const map = new L.Evented();
    map.hasLayer = () => true;
    map.project = latlng => L.CRS.EPSG3857.latLngToPoint(L.latLng(latlng), zoom);
    map.unproject = point => L.CRS.EPSG3857.pointToLatLng(L.point(point), zoom);
    const drawnItems = L.featureGroup();
    const integration = window.PlanMilT.tacticalGraphics.attach({
        map, leaflet: L, library: {}, catalog: {}, drawnItems,
        button: { addEventListener() {} },
        sweetAlert: {
            async fire() {
                return { isConfirmed: true, value: {
                    designation: '',
                    boundary: { type: 'Companhia', leftText: 'A', rightText: 'B', count: 2 }
                } };
            }
        },
        getDefaultColor: () => '#123456'
    });
    const line = L.polyline([[-20.123456789, -50.987654321], [-20.1, -49.9]], { color: '#abcdef' });
    const originalGeometry = line.toGeoJSON(false).geometry;
    assert.equal(await integration.convertLineToBoundary(line), true);
    assert.ok(drawnItems.hasLayer(line));
    const saved = window.PlanMilT.geoJsonSerialization.toFeatureCollection(drawnItems, false);
    assert.deepEqual(saved.features[0].geometry, originalGeometry);
    assert.equal(saved.features[0].properties.color, '#abcdef');
    assert.equal(saved.features.filter(item => item.properties.role === 'boundaryMark').length, 2);
    const originalDash = line.options.dashArray;
    zoom = 13;
    map.fire('zoomend');
    assert.notEqual(line.options.dashArray, originalDash);
});
