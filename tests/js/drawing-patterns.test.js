const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '../../js/features', file), 'utf8');
const main = read('main.js');
const createdHandler = main.slice(main.indexOf('map.on(L.Draw.Event.CREATED,'));
const patternSource = read('drawing-patterns.js');

function harness(option) {
    let handler;
    const added = [];
    const alerts = [];
    const map = { on(name, callback) { handler = callback; }, fitBounds() {} };
    class Pattern {
        constructor(options) { this.options = options; }
        addShape(shape) { this.shape = shape; }
        addTo(target) { assert.equal(target, map); }
    }
    class Shape { constructor(options) { this.options = options; } }
    const geometry = { type: 'Polygon', coordinates: [[[-50, -20], [-49, -20], [-49, -21], [-50, -20]]] };
    const makeLayer = () => ({
        styles: [],
        setStyle(style) { this.styles.push(style); },
        getLatLng: () => ({ lat: -20, lng: -50 }),
        getRadius: () => 1000,
        toGeoJSON() { return { type: 'Feature', properties: this.feature?.properties || {}, geometry }; }
    });
    const L = { Draw: { Event: { CREATED: 'draw:created' } }, Pattern, PatternPath: Shape, PatternCircle: Shape,
        polygon: () => makeLayer() };
    const context = {
        window: { PlanMilT: { drawingGeometry: { createCirclePolygon: () => [[[-20, -50]]] } } },
        map, L, drawnItems: { addLayer: layer => added.push(layer) },
        tacticalGraphics: { handleCreated: event => Boolean(event.tactical) },
        Swal: { fire: async options => { alerts.push(options); return { value: option }; } },
        defaultColor: '#123456'
    };
    vm.runInNewContext(patternSource, context);
    vm.runInNewContext(createdHandler, context);
    return { context, map, L, makeLayer, added, alerts, handler: event => handler(event) };
}

for (const type of ['polygon', 'rectangle', 'circle']) {
    for (const option of ['solid', 'patternX', 'patternSlash', 'patternDots', undefined]) {
        test(`${type} applies and persists ${option || 'the initial style on cancellation'}`, async () => {
            const h = harness(option);
            const original = h.makeLayer();
            await h.handler({ layerType: type, layer: original });
            assert.equal(h.added.length, 1);
            assert.equal(h.alerts[0].inputOptions.patternDots, 'Padrão "."');
            const layer = h.added[0];
            const saved = layer.toGeoJSON();
            assert.equal(saved.geometry.type, 'Polygon');
            assert.equal(saved.properties.color, '#123456');
            if (type === 'circle') {
                assert.notEqual(layer, original);
                assert.equal(saved.properties.shape, 'circle');
                assert.equal(saved.properties.radius, 1000);
                assert.equal(saved.properties.center.join(','), '-20,-50');
            } else assert.equal(layer, original);
            if (option === 'solid') {
                assert.equal(saved.properties.fillColor, '#123456');
                assert.equal(saved.properties.fillOpacity, 0.5);
            } else if (option) {
                assert.equal(saved.properties.fillPattern, option);
                assert.equal(layer.styles[0].fillPattern.shape.options.fillColor || layer.styles[0].fillPattern.shape.options.color, '#123456');
                assert.equal(layer.styles[0].fillOpacity, 0.2);
            } else {
                assert.equal(layer.styles.length, 0);
                assert.equal(saved.properties.fillPattern, undefined);
                if (type === 'circle') assert.equal(saved.properties.fillOpacity, 0.5);
            }
        });
    }
}

test('tactical circles bypass the ordinary fill selector', async () => {
    const h = harness('patternDots');
    await h.handler({ tactical: true, layerType: 'circle', layer: h.makeLayer() });
    assert.equal(h.alerts.length, 0);
    assert.equal(h.added.length, 0);
});

test('patterns are cached per map and reject unsupported types', () => {
    const h = harness();
    const get = h.context.window.PlanMilT.drawingPatterns.get;
    const dots = get(h.map, h.L, 'patternDots', '#123456');
    assert.equal(get(h.map, h.L, 'patternDots', '#123456'), dots);
    assert.notEqual(get(h.map, h.L, 'patternDots', '#654321'), dots);
    assert.equal(dots.shape.options.radius, 1.2);
    assert.equal(dots.shape.options.fillOpacity, 1);
    assert.throws(() => get(h.map, h.L, 'invalid', '#123456'), /não suportado/);
});

for (const editable of [true, false]) {
    test(`restores area patterns ${editable ? 'for editing' : 'as an overlay'}`, async () => {
        const h = harness();
        const feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] },
            properties: { shape: 'circle', center: [-20, -50], radius: 1000, color: '#123456', fillPattern: 'patternDots' } };
        let restored;
        Object.assign(h.context, {
            document: { getElementById: () => ({ addEventListener() {} }) },
            Swal: { fire: async () => ({ isConfirmed: editable }) },
            isValidGeoJson: () => true,
            addNewOverlayLayer() {},
            console: { info() {}, error(error) { throw error; } }
        });
        h.context.window.location = { href: 'https://example.test/' };
        Object.assign(h.context.window.PlanMilT, {
            apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) },
            coverageImage: { clear() {} },
            welcome: { record: () => true }
        });
        Object.assign(h.context.drawnItems, { clearLayers() {}, getLayers: () => [], getBounds: () => ({}) });
        h.L.geoJson = (data, options) => {
            if (!data) return { addTo() { return this; }, addLayer(layer) { restored = layer; } };
            const layer = h.makeLayer();
            layer.feature = feature;
            options.onEachFeature(feature, layer);
            return { addTo() { return this; } };
        };
        vm.runInNewContext(read('drawing-loading.js'), h.context);
        await h.context.window.PlanMilT.drawingLoading.load('teste');
        if (editable) restored = h.added[0];
        assert.equal(restored.feature.properties.fillPattern, 'patternDots');
        assert.equal(restored.styles[0].fillPattern.shape.options.fillColor, '#123456');
        assert.equal(restored.toGeoJSON().geometry.type, 'Polygon');
    });
}

for (const mode of ['shared', 'refresh']) {
    test(`restores patterned areas in ${mode} layers`, async () => {
        const h = harness();
        const feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] },
            properties: { color: '#123456', fillPattern: 'patternDots' } };
        let restored;
        Object.assign(h.context, {
            URL, URLSearchParams,
            document: { addEventListener() {}, getElementById: () => ({ addEventListener() {} }),
                querySelector: () => ({}), querySelectorAll: () => [] },
            addNewOverlayLayer() {}, layerRegistry: {}, isValidGeoJson: () => true,
            Swal: { fire() {} }, console: { info() {}, error(error) { throw error; } }
        });
        h.context.window.location = { href: 'https://example.test/?camada=teste' };
        h.context.window.PlanMilT.apiClient = { request: async () => ({
            ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] })
        }) };
        h.L.geoJson = (data, options) => {
            if (!data) return { addTo() { return this; }, addLayer(layer) { restored = layer; } };
            const layer = h.makeLayer();
            layer.feature = feature;
            options.onEachFeature(feature, layer);
            return {};
        };
        if (mode === 'shared') {
            vm.runInNewContext(read('shared-layers.js'), h.context);
            await h.context.loadSharedLayers();
        } else {
            const source = read('layer-management.js').split('// Função para verificar se o objeto é um GeoJSON válido')[0];
            vm.runInNewContext(source, h.context);
            h.context.selectedLayers.push('teste');
            await h.context.reloadLayer();
        }

        assert.equal(restored.feature.properties.fillPattern, 'patternDots');
        assert.equal(restored.styles[0].fillPattern.shape.options.fillColor, '#123456');
    });
}

for (const mode of ['shared', 'refresh']) {
    test(`restores legacy default markers in ${mode} layers`, async () => {
        const h = harness();
        const feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [-50, -20] },
            properties: { iconUrl: 'marker-icon.png' } };
        let restored;
        class DefaultIcon {}
        Object.assign(h.context, {
            URL, URLSearchParams,
            document: { addEventListener() {}, getElementById: () => ({ addEventListener() {} }),
                querySelector: () => ({}), querySelectorAll: () => [] },
            addNewOverlayLayer() {}, layerRegistry: {}, isValidGeoJson: () => true,
            Swal: { fire() {} }, console: { info() {}, error(error) { throw error; } }
        });
        h.context.window.location = { href: 'https://example.test/?camada=teste' };
        h.context.window.PlanMilT.apiClient = { request: async () => ({
            ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] })
        }) };
        h.L.Icon = { Default: DefaultIcon };
        h.L.geoJson = (data, options) => {
            if (!data) return { addTo() { return this; }, addLayer(layer) { restored = layer; } };
            const layer = { feature, setIcon(icon) { this.icon = icon; } };
            options.onEachFeature(feature, layer);
            return {};
        };
        vm.runInNewContext(read('icon-selector.js'), h.context);
        if (mode === 'shared') {
            vm.runInNewContext(read('shared-layers.js'), h.context);
            await h.context.loadSharedLayers();
        } else {
            const source = read('layer-management.js').split('// Função para verificar se o objeto é um GeoJSON válido')[0];
            vm.runInNewContext(source, h.context);
            h.context.selectedLayers.push('teste');
            await h.context.reloadLayer();
        }
        assert.ok(restored.icon instanceof DefaultIcon);
    });
}
