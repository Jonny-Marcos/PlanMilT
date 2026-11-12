const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('shared-resource readiness waits for protected images', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/shared-layers.js'), 'utf8');
    let start;
    let release;
    let completed = false;
    const imageReady = new Promise(resolve => { release = resolve; });
    const context = {
        URL, URLSearchParams,
        document: {
            addEventListener(name, callback) { if (name === 'DOMContentLoaded') start = callback; },
            getElementById: () => ({ addEventListener() {} }),
            querySelector: () => ({}), querySelectorAll: () => []
        },
        window: { location: { href: 'https://example.test/?calco=1' }, PlanMilT: {} },
        loadImageFromId: () => imageReady,
        console
    };
    vm.runInNewContext(source, context);
    start().then(() => { completed = true; });
    await Promise.resolve();
    assert.equal(completed, false);
    release();
    await context.window.PlanMilT.sharedLayersReady;
    await Promise.resolve();
    assert.equal(completed, true);
});

test('shared-resource loading waits for local restoration and keeps duplicate names separate', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/shared-layers.js'), 'utf8');
    let start;
    let release;
    let loaded = false;
    let name;
    const ready = new Promise(resolve => { release = resolve; });
    const context = {
        URL, URLSearchParams,
        document: {
            addEventListener(event, callback) { if (event === 'DOMContentLoaded') start = callback; },
            getElementById: () => ({ addEventListener() {} }),
            querySelector: () => ({}), querySelectorAll: () => []
        },
        window: { location: { href: 'https://example.test/?camada=teste' }, PlanMilT: {
            localSessionReady: ready,
            apiClient: { request: async () => { loaded = true; return { ok: true, json: async () => ({ type: 'FeatureCollection', features: [] }) }; } }
        } },
        L: { geoJson(data) { return data ? {} : { addTo() { return this; }, addLayer() {} }; } },
        map: {}, layerRegistry: { teste: {} }, addNewOverlayLayer(value) { name = value; },
        isValidGeoJson: () => true, console: { info() {}, error(error) { throw error; } }
    };
    vm.runInNewContext(source, context);
    const loading = start();
    await Promise.resolve();
    assert.equal(loaded, false);
    release();
    await loading;
    assert.equal(name, 'teste (2)');
});

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
        map: {}, layerRegistry: {}, addNewOverlayLayer(name) { assert.equal(name, 'teste'); },
        isValidGeoJson: () => true,
        console: { info() {}, warn() {}, error(error) { throw new Error(error); } }
    };
    vm.runInNewContext(source, context);
    await load();
    assert.equal(added.length, 1);
    assert.equal(added[0].image, true);
});

test('shared planning restores the military symbol icon and its original dimensions', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/shared-layers.js'), 'utf8');
    let load;
    let icon;
    const symbol = { iconUrl: 'data:image/svg+xml,test', iconSize: [90, 50], iconAnchor: [60, 25] };
    const feature = { type: 'Feature', properties: { iconUrl: symbol.iconUrl, militarySymbol: symbol },
        geometry: { type: 'Point', coordinates: [-50, -20] } };
    const context = {
        URL, URLSearchParams,
        document: {
            addEventListener(name, callback) { if (name === 'DOMContentLoaded') load = callback; },
            getElementById: () => ({ addEventListener() {} }),
            querySelector: () => ({}), querySelectorAll: () => []
        },
        window: { location: { href: 'https://example.test/?camada=teste' }, PlanMilT: {
            apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) },
            militarySymbols: { createIcon(data) { assert.equal(data, symbol); return { data }; } }
        } },
        L: { geoJson(data, options) {
            if (!data) return { addTo() { return this; }, addLayer() {} };
            options.onEachFeature(feature, { setIcon(value) { icon = value; } });
            return {};
        } },
        map: {}, layerRegistry: {}, addNewOverlayLayer() {}, isValidGeoJson: () => true,
        console: { info() {}, warn() {}, error(error) { throw new Error(error); } }
    };
    vm.runInNewContext(source, context);
    await load();
    assert.equal(icon.data, symbol);
});

test('shared planning preserves tactical boundary label offsets', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/shared-layers.js'), 'utf8');
    let load;
    let icon;
    const feature = {
        type: 'Feature',
        properties: { text: '1º Pel', role: 'boundaryLabel', boundaryOffset: [0, -14], color: '#123456' },
        geometry: { type: 'Point', coordinates: [-50, -20] }
    };
    const context = {
        URL, URLSearchParams,
        document: {
            addEventListener(name, callback) { if (name === 'DOMContentLoaded') load = callback; },
            getElementById: () => ({ addEventListener() {} }),
            querySelector: () => ({}), querySelectorAll: () => []
        },
        window: { location: { href: 'https://example.test/?camada=teste' }, PlanMilT: {
            apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) },
            tacticalGraphics: {
                createBoundaryLabelIcon(leaflet, text, offset, color) {
                    return leaflet.divIcon({ text, offset, color });
                }
            }
        } },
        L: {
            geoJson(data, options) {
                if (!data) return { addTo() { return this; }, addLayer() {} };
                options.onEachFeature(feature, { setIcon(value) { icon = value; } });
                return {};
            },
            divIcon(options) { return options; }
        },
        map: {}, layerRegistry: {}, addNewOverlayLayer() {}, isValidGeoJson: () => true,
        console: { info() {}, warn() {}, error(error) { throw new Error(error); } }
    };

    vm.runInNewContext(source, context);
    await load();

    assert.equal(icon.text, '1º Pel');
    assert.equal(icon.offset.join(','), '0,-14');
    assert.equal(icon.color, '#123456');
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

test('KMZ imports are registered as uniquely named map overlays', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/kmz-import.js'), 'utf8');
    let change;
    let added;
    const group = { getLayers: () => [] };
    const context = {
        document: { getElementById(id) { return { addEventListener(name, callback) {
            if (id === 'fileInput' && name === 'change') change = callback;
        } }; } },
        drawnItems: { on() {} },
        L: { Hash: class {}, layerGroup: () => group },
        map: { attributionControl: { setPrefix() {} } },
        Autolinker: class {},
        FileReader: class { readAsArrayBuffer() { this.onload({ target: { result: {} } }); } },
        JSZip: { loadAsync: async () => ({ file: () => ({ async: async () => '<kml/>' }) }) },
        DOMParser: class { parseFromString() { return { querySelectorAll: () => [] }; } },
        layerRegistry: { mapa: {} },
        addNewOverlayLayer(name, layer) { added = { name, layer }; },
        console: { info() {}, error(error) { throw new Error(error); } }
    };
    vm.runInNewContext(source, context);
    change({ target: { files: [{ name: 'mapa.kmz' }] } });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(added.name, 'mapa (2)');
    assert.equal(added.layer, group);
});

test('KMZ imports a military symbol with its image dimensions and geographic anchor', async () => {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/kmz-import.js'), 'utf8');
    let restored;
    const hotspot = { getAttribute(name) { return { x: '0.75', y: '0.6', xunits: 'fraction', yunits: 'fraction' }[name]; } };
    const iconNode = { textContent: 'files/planmilt-symbol-1.png', parentElement: { parentElement: { querySelector: () => hotspot } } };
    const placemark = { querySelector(selector) {
        if (selector === 'styleUrl') return { textContent: '#m_files/planmilt-symbol-1.png' };
        if (selector === 'coordinates') return { textContent: '-50,-20,0' };
        return null;
    } };
    const context = {
        document: {
            getElementById: () => ({ addEventListener() {} }),
            createElement() { return { naturalWidth: 100, naturalHeight: 50, set src(value) { queueMicrotask(() => this.onload()); } }; }
        },
        drawnItems: { on() {} },
        L: {
            Hash: class {},
            latLng: (lat, lng) => [lat, lng],
            icon: options => options,
            marker: (position, options) => ({ addTo(layer) { restored = { position, options, layer }; } })
        },
        map: { attributionControl: { setPrefix() {} } },
        Autolinker: class {},
        DOMParser: class { parseFromString() { return { querySelectorAll(selector) {
            return selector === 'IconStyle > Icon > href' ? [iconNode] : [placemark];
        } }; } },
        window: { PlanMilT: {} }, console,
        Swal: { fire() { throw new Error('unexpected error'); } },
        queueMicrotask
    };
    vm.runInNewContext(source, context);
    const layer = { getLayers: () => [] };
    context.processImagesFromKML('', { file: () => ({ async: async () => 'AQ==' }) }, layer);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(restored.position, [-20, -50]);
    assert.equal(restored.options.icon.iconSize[0], 100);
    assert.equal(restored.options.icon.iconSize[1], 50);
    assert.equal(restored.options.icon.iconAnchor[0], 75);
    assert.equal(restored.options.icon.iconAnchor[1], 20);
    assert.equal(restored.layer, layer);
});
