const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/drawing-geometry.js');

const drawingGeometry = window.PlanMilT.drawingGeometry;

test('circle polygon returns a GeoJSON-style outer ring', () => {
    const oneDegreeRadius = 6378137 * Math.PI / 180;
    const polygon = drawingGeometry.createCirclePolygon(
        { lat: 0, lng: 0 },
        oneDegreeRadius,
        4
    );

    assert.equal(polygon.length, 1);
    assert.equal(polygon[0].length, 4);
    assert.deepEqual(polygon[0][0], [0, 1]);
    assert.ok(Math.abs(polygon[0][1][0] - 1) < 1e-10);
    assert.ok(Math.abs(polygon[0][1][1]) < 1e-10);
    assert.ok(Math.abs(polygon[0][2][0]) < 1e-10);
    assert.ok(Math.abs(polygon[0][2][1] + 1) < 1e-10);
});

test('circle polygon defaults to 64 vertices', () => {
    const polygon = drawingGeometry.createCirclePolygon({ lat: -20, lng: -50 }, 1000);

    assert.equal(polygon[0].length, 64);
});