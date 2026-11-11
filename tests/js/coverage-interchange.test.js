const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('shared planning restores raster coverages to its overlay', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/shared-layers.js'), 'utf8');
    let load;
    const added = [];
    const feature = { type: 'Feature', geometry: null, properties: { coverageImage: {} } };
    const context = {
        URL, URLSearchParams,
        document: {
            addEventListener(name, callback) { if (name === 'DOMContentLoaded') load = callback; },
            getElementById: () => ({ addEventListener() {} }),
            querySelector: () => ({}), querySelectorAll: () => []
        },
        window: { location: { href: 'https://example.test/?camada=teste' }, PlanMilT: {
            apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) },
            coverageImage: { fromFeature(actual) { assert.equal(actual, feature); return { image: true }; } }
        } },
        L: { geoJson(data) {
            if (!data) return { addTo() { return this; }, addLayer(layer) { added.push(layer); } };
            assert.equal(data.features.length, 0);
            return {};
        } },
        map: {}, addNewOverlayLayer(name) { assert.equal(name, 'teste'); },
        isValidGeoJson: () => true,
        console: { info() {}, warn() {}, error(error) { throw new Error(error); } }
    };
    vm.runInNewContext(source, context);
    await load();
    assert.equal(added.length, 1);
    assert.equal(added[0].image, true);
});

test('KMZ coverage import reprojects the geographic PNG and restores coverage metadata', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/kmz-import.js'), 'utf8');
    const values = { south: '-22', west: '-52', north: '-21', east: '-51' };
    const box = { querySelector: key => ({ textContent: values[key] }) };
    const node = {
        querySelector(key) {
            if (key === 'Icon > href') return { textContent: 'coverage/coverage-1.png' };
            if (key === 'LatLonBox') return box;
            if (key.includes('planmilt-coverage')) return {};
            if (key.includes('planmilt-mode')) return { textContent: 'radio' };
            if (key.includes('planmilt-resolution-km')) return { textContent: '0.5' };
            throw new Error(key);
        }
    };
    let restored;
    let added;
    const context = {
        document: {
            getElementById: () => ({ addEventListener() {} }),
            createElement() {
                return { set src(value) { this.url = value; queueMicrotask(() => this.onload()); } };
            }
        },
        drawnItems: { on() {} },
        L: { Hash: class {} },
        map: { attributionControl: { setPrefix() {} } },
        Autolinker: class {},
        DOMParser: class { parseFromString() { return { querySelectorAll: () => [node] }; } },
        window: { PlanMilT: { coverageImage: {
            projectGeographic(image, bounds) {
                assert.equal(image.url, 'data:image/png;base64,AQ==');
                assert.equal(bounds[0][0], -22);
                return 'data:image/png;base64,Ag==';
            },
            fromFeature(feature) {
                restored = feature;
                return { addTo(layer) { added = layer; } };
            }
        } } },
        console: { error(error) { throw new Error(error); } },
        Swal: { fire() { throw new Error('unexpected error'); } },
        queueMicrotask
    };
    vm.runInNewContext(source, context);
    const layer = {};
    context.processGroundOverlaysFromKML('', { file: () => ({ async: async () => 'AQ==' }) }, layer);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(added, layer);
    const data = restored.properties.coverageImage;
    assert.equal(data.mapImage, 'data:image/png;base64,Ag==');
    assert.equal(data.image, 'data:image/png;base64,AQ==');
    assert.equal(data.resolutionKm, 0.5);
    assert.equal(data.mode, 'radio');
});
