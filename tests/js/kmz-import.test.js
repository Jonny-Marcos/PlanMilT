const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('imported tactical image overlays are reprojected for the Leaflet map', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/kmz-import.js'), 'utf8');
    const start = source.indexOf('function processGroundOverlaysFromKML(');
    const end = source.indexOf('function kmlColorToHex(', start);
    const box = { querySelector: name => ({ textContent: { north: '-19', south: '-21', east: '-49', west: '-51' }[name] }) };
    const node = { querySelector(selector) {
        if (selector === 'Icon > href') return { textContent: 'tactical/graphic-1.png' };
        if (selector === 'LatLonBox') return box;
        if (selector.includes('planmilt-tactical-image')) return {};
        return null;
    } };
    const added = [];
    const projected = [];
    const context = {
        DOMParser: class { parseFromString() { return { querySelectorAll: () => [node] }; } },
        document: { createElement: () => ({ set src(value) { this.url = value; queueMicrotask(() => this.onload()); } }) },
        window: { PlanMilT: { coverageImage: { projectGeographic(image, bounds) {
            projected.push({ image, bounds }); return 'projected-image';
        } } } },
        L: { imageOverlay: (image, bounds) => ({ addTo: group => added.push({ image, bounds, group }) }) },
        Swal: { fire() { throw new Error('unexpected error'); } },
        console
    };
    vm.runInNewContext(source.slice(start, end), context);
    const group = {};
    context.processGroundOverlaysFromKML('', { file: () => ({ async: async () => 'AQ==' }) }, group);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(projected[0].image.url, 'data:image/png;base64,AQ==');
    assert.equal(added[0].image, 'projected-image');
    assert.equal(added[0].group, group);
    assert.equal(JSON.stringify(added[0].bounds), '[[-21,-51],[-19,-49]]');
});
