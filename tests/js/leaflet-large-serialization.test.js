const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

global.window = global;
global.screen = {};
global.document = {
    documentElement: { style: {} },
    createElement: () => ({ getContext: () => ({}), style: {} })
};
const L = require('../../js/library/leaflet.js');
require('../../js/features/geojson-serialization.js');
require('../../js/features/tactical-graphics.js');
require('../../js/features/drawing-geometry.js');
window.PlanMilT.localHistory = { graphics: () => [], recordGraphic() {} };

test('real Leaflet serializes a patterned circle as a valid polygon with its fill', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/main.js'), 'utf8');
    let handler;
    const map = { on(eventName, listener) { handler = listener; } };
    const drawnItems = L.featureGroup();
    L.Draw = { Event: { CREATED: 'draw:created' } };
    window.PlanMilT.drawingPatterns = { get: () => ({}) };
    vm.runInNewContext(source.slice(source.indexOf('map.on(L.Draw.Event.CREATED,')), {
        window, L, map, drawnItems, defaultColor: '#123456',
        tacticalGraphics: { handleCreated: () => false },
        Swal: { fire: async () => ({ value: 'patternDots' }) }
    });
    await handler({ layerType: 'circle', layer: L.circle([-20, -50], { radius: 1000 }) });
    const saved = window.PlanMilT.geoJsonSerialization.toFeatureCollection(drawnItems, false).features[0];
    assert.equal(saved.geometry.type, 'Polygon');
    assert.equal(saved.geometry.coordinates.length, 1);
    assert.equal(saved.geometry.coordinates[0].length, 65);
    assert.equal(typeof saved.geometry.coordinates[0][0][0], 'number');
    assert.equal(saved.properties.fillPattern, 'patternDots');
    assert.equal(saved.properties.radius, 1000);
    assert.equal(drawnItems.getLayers()[0].options.fillOpacity, 0.2);
});

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
