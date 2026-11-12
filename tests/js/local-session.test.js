const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/local-session.js'), 'utf8');

function database(records) {
    return {
        open(name) {
            const request = {};
            queueMicrotask(() => {
                if (!records.has(name)) records.set(name, undefined);
                request.result = {
                    createObjectStore() {},
                    transaction() {
                        const transaction = {
                            objectStore() {
                                return {
                                    get() {
                                        const result = {};
                                        queueMicrotask(() => {
                                            result.result = structuredClone(records.get(name));
                                            transaction.oncomplete();
                                        });
                                        return result;
                                    },
                                    put(value) {
                                        const result = {};
                                        queueMicrotask(() => {
                                            if (records.failWrites) {
                                                transaction.error = new Error('quota');
                                                transaction.onerror();
                                                return;
                                            }
                                            records.set(name, structuredClone(value));
                                            transaction.oncomplete();
                                        });
                                        return result;
                                    }
                                };
                            }
                        };
                        return transaction;
                    }
                };
                request.onsuccess();
            });
            return request;
        }
    };
}

function emitter() {
    const listeners = new Map();
    return {
        on(names, callback) {
            names.split(' ').forEach(name => listeners.set(name, [...(listeners.get(name) || []), callback]));
            return this;
        },
        fire(name) { for (const callback of listeners.get(name) || []) callback(); }
    };
}

function createHarness(records, pathname = '/app/') {
    const timers = new Map();
    const documentEvents = new Map();
    let timerId = 0;
    const notices = [];
    const active = new Set();
    const map = Object.assign(emitter(), {
        hasLayer: layer => active.has(layer),
        addLayer(layer) { active.add(layer); this.fire('layeradd'); },
        removeLayer(layer) { active.delete(layer); this.fire('layerremove'); },
        getCenter: () => ({ lat: -20, lng: -50 }), getZoom: () => 12,
        setView(center, zoom) { this.restoredView = { center, zoom }; }
    });
    const group = () => Object.assign(emitter(), {
        children: [],
        eachLayer(callback) { this.children.forEach(callback); },
        addLayer(layer) { this.children.push(layer); this.fire('layeradd'); return this; }
    });
    const drawnItems = group();
    const coverage = group();
    const planning = group();
    const builtin = { options: { opacity: 1 } };
    const registry = { OpenTopo: builtin, 'Sugestão de Planejamento': planning };
    active.add(builtin);
    active.add(coverage);
    let restoredDrawings;
    const L = {
        featureGroup: group,
        tileLayer: { wms: (url, params) => ({ _url: url, wmsParams: params, options: { opacity: params.opacity } }) },
        imageOverlay: (url, bounds, options) => ({ _url: url, bounds, options }),
        geoJson: feature => ({ getLayers: () => [{ feature }] }),
        marker: () => ({}), icon: value => value, divIcon: value => value
    };
    const context = {
        URL, structuredClone, indexedDB: database(records), console: { error() {} },
        window: { location: { href: `https://example.test${pathname}` }, PlanMilT: {
            coverageImage: { getGroup: () => coverage, fromFeature: feature => ({ feature }) },
            geoJsonSerialization: { toFeatureCollection: () => ({ type: 'FeatureCollection', features: [] }) },
            drawingLoading: { async restore(data) { restoredDrawings = data; } },
            drawingPatterns: { get: () => ({}) }
        } },
        document: {
            createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
            addEventListener(name, callback) { documentEvents.set(name, callback); },
            body: { appendChild(element) { notices.push(element); } },
            getElementById: () => ({ addEventListener() {} })
        },
        setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(source, context);
    const deps = { map, leaflet: L, drawnItems, layerRegistry: registry,
        tacticalGraphics: {},
        addNewOverlayLayer(name, layer) { registry[name] = layer; map.addLayer(layer); } };
    return { map, registry, drawnItems, coverage, planning, notices, active, context, deps, documentEvents,
        start: () => context.window.PlanMilT.localSession.start(deps),
        restored: () => restoredDrawings,
        async flush() {
            const callbacks = [...timers.values()];
            timers.clear();
            callbacks.forEach(callback => callback());
            for (let i = 0; i < 10; i++) await Promise.resolve();
        }
    };
}

test('recovers unsaved drawings, WMS visibility and local protected images across launches', async () => {
    const records = new Map();
    const first = createHarness(records);
    await first.start();
    const feature = { type: 'Feature', properties: { color: '#000', fillPattern: 'patternDots' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };
    first.drawnItems.addLayer({ options: {}, toGeoJSON: () => feature });
    const image = { _url: 'data:image/png;base64,AAAA', options: { opacity: 0.7 },
        getBounds: () => ({ getSouth: () => -21, getWest: () => -51, getNorth: () => -20, getEast: () => -50 }) };
    first.deps.addNewOverlayLayer('Imagem protegida', image);
    const wms = { _url: 'https://maps.example.test/wms', wmsParams: { layers: 'test', format: 'image/png' },
        options: { opacity: 0.8 } };
    first.deps.addNewOverlayLayer('WMS', wms);
    first.map.removeLayer(wms);
    first.planning.addLayer({ options: { icon: { options: { iconUrl: '/symbols/unit.png' } } },
        toGeoJSON: () => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-50, -20] } }) });
    await first.flush();
    const saved = records.get('planmilt.session.v1:/app/');
    assert.equal(saved.drawings.features[0].properties.fillPattern, 'patternDots');
    assert.equal(saved.layers.find(layer => layer.name === 'WMS').active, false);
    assert.equal(saved.layers.find(layer => layer.name === 'Imagem protegida').url, image._url);
    assert.doesNotMatch(JSON.stringify(saved), /senha|password|token/i);

    const second = createHarness(records);
    await second.start();
    assert.equal(second.restored().features[0].properties.fillPattern, 'patternDots');
    assert.equal(second.registry['Imagem protegida']._url, image._url);
    assert.equal(second.map.hasLayer(second.registry['Imagem protegida']), true);
    assert.equal(second.map.hasLayer(second.registry.WMS), false);
    assert.equal(second.registry.WMS.wmsParams.layers, 'test');
    assert.equal(second.planning.children[0].feature.properties.iconUrl, '/symbols/unit.png');
    assert.equal(second.planning.children[0].feature.geometry.type, 'Point');
    assert.equal(second.map.restoredView.center.join(','), '-20,-50');

    const otherInstallation = createHarness(records, '/other/');
    await otherInstallation.start();
    assert.equal(otherInstallation.restored(), undefined);
});

test('persists edited drawings and flushes pending changes when the page becomes hidden', async () => {
    const records = new Map();
    const h = createHarness(records);
    await h.start();
    const feature = { type: 'Feature', properties: { text: 'antes' }, geometry: { type: 'Point', coordinates: [0, 0] } };
    h.drawnItems.addLayer({ options: {}, toGeoJSON: () => feature });
    await h.flush();
    feature.properties.text = 'depois';
    h.map.fire('planmilt:changed');
    h.context.document.visibilityState = 'hidden';
    h.documentEvents.get('visibilitychange')();
    await h.flush();
    assert.equal(records.get('planmilt.session.v1:/app/').drawings.features[0].properties.text, 'depois');
});

test('storage quota failures preserve the last committed snapshot and notify the user', async () => {
    const records = new Map();
    const h = createHarness(records);
    await h.start();
    h.drawnItems.addLayer({ options: {}, toGeoJSON: () => ({
        type: 'Feature', properties: { name: 'primeiro' }, geometry: { type: 'Point', coordinates: [0, 0] }
    }) });
    await h.flush();
    records.failWrites = true;
    h.drawnItems.addLayer({ options: {}, toGeoJSON: () => ({
        type: 'Feature', properties: { name: 'segundo' }, geometry: { type: 'Point', coordinates: [1, 1] }
    }) });
    await h.flush();
    assert.equal(records.get('planmilt.session.v1:/app/').drawings.features.length, 1);
    assert.match(h.notices[0].textContent, /Não foi possível guardar/);
});

test('does not replace an earlier snapshot if the user edits before restoration', async () => {
    const records = new Map([['planmilt.session.v1:/app/', { version: 1,
        drawings: { type: 'FeatureCollection', features: [] }, layers: [], center: [0, 0], zoom: 2 }]]);
    const h = createHarness(records);
    const starting = h.start();
    h.drawnItems.addLayer({ toGeoJSON: () => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [0, 0] } }) });
    await starting;
    h.map.fire('draw:edited');
    await h.flush();
    assert.equal(h.restored(), undefined);
    assert.equal(records.get('planmilt.session.v1:/app/').zoom, 2);
    assert.match(h.notices[0].textContent, /não foi carregado/);
});

test('reports credential-bearing WMS URLs and keeps the previous snapshot', async () => {
    const records = new Map();
    const h = createHarness(records);
    await h.start();
    h.deps.addNewOverlayLayer('Protegida', {
        _url: 'https://maps.example.test/wms?token=secret',
        wmsParams: { layers: 'test' }, options: {}
    });
    await h.flush();
    assert.equal(records.get('planmilt.session.v1:/app/'), undefined);
    assert.match(h.notices[0].textContent, /Não foi possível guardar/);
});

test('restores planning markers as direct real Leaflet layers usable by task selectors', async () => {
    global.window = global;
    global.screen = {};
    global.document = { documentElement: { style: {} }, createElement: () => ({ getContext: () => ({}), style: {} }) };
    const L = require('../../js/library/leaflet.js');
    const records = new Map();
    const first = createHarness(records);
    first.deps.leaflet = L;
    await first.start();
    const marker = L.marker([-20, -50], { icon: L.icon({ iconUrl: '/symbols/unit.png', iconSize: [40, 40] }) });
    first.planning.addLayer(marker);
    await first.flush();

    const second = createHarness(records);
    second.deps.leaflet = L;
    await second.start();
    const restored = second.planning.children[0];
    assert.ok(restored instanceof L.Marker);
    assert.equal(restored.options.icon.options.iconUrl, '/symbols/unit.png');
    assert.equal(restored.getLatLng().lat, -20);
    assert.equal(restored.getLatLng().lng, -50);
});
