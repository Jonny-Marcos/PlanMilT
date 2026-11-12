const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/map-3d-geometry.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const geometry = context.window.PlanMilT.map3dGeometry;

test('builds a Mercator mesh with terrain heights, image texture coordinates and triangles', () => {
    const mesh = geometry.createMesh({
        bounds: [-1, -1, 1, 1],
        elevations: [[100, 120], [140, 160]]
    }, 2);
    assert.equal(mesh.rows, 2);
    assert.equal(mesh.columns, 2);
    assert.equal(mesh.vertices.length, 20);
    assert.deepEqual(Array.from(mesh.indices), [0, 2, 1, 1, 2, 3]);
    assert.equal(mesh.vertices[1], -60);
    assert.equal(mesh.vertices[6], -20);
    assert.equal(mesh.vertices[3], 0);
    assert.equal(mesh.vertices[4], 1);
    assert.ok(mesh.width > 0 && mesh.depth > 0);
});

test('fills missing terrain samples and rejects unsafe grid dimensions', () => {
    const mesh = geometry.createMesh({
        bounds: [-1, -1, 1, 1],
        elevations: [[null, 100], [100, 100]]
    });
    assert.ok(Array.from(mesh.vertices).every(Number.isFinite));
    assert.throws(() => geometry.createMesh({
        bounds: [-1, -1, 1, 1], elevations: Array.from({ length: 66 }, () => [0, 0])
    }), /dimensões inválidas/);
    assert.throws(() => geometry.createMesh({
        bounds: [-90, -1, 1, 1], elevations: [[0, 0], [0, 0]]
    }), /inválida/);
});
