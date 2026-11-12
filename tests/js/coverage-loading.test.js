const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/drawing-loading.js'), 'utf8');

test('local restoration reuses editable drawing loading without a server request or dialog', async () => {
    const feature = { type: 'Feature', properties: { color: '#123456', fillPattern: 'patternDots' },
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } };
    const restored = [];
    const pattern = {};
    const context = {
        document: { getElementById: () => ({ addEventListener() {} }) },
        window: { location: { href: 'https://example.test/' }, PlanMilT: {
            drawingPatterns: { get: () => pattern },
            coverageImage: { clear() {} }
        } },
        L: { geoJson(data, options) {
            const layer = { feature, setStyle(style) { this.style = style; } };
            options.onEachFeature(data.features[0], layer);
            return { addTo() {} };
        } },
        map: {}, drawnItems: { clearLayers() {}, addLayer(layer) { restored.push(layer); } },
        isValidGeoJson: () => true,
        console: { info() {}, error(error) { throw error; } }
    };
    vm.runInNewContext(source, context);
    await context.window.PlanMilT.drawingLoading.restore({ type: 'FeatureCollection', features: [feature] });
    assert.equal(restored.length, 1);
    assert.equal(restored[0].feature, feature);
    assert.equal(restored[0].style.fillPattern, pattern);
});

for (const editable of [true, false]) {
    test(`saved coverage keeps its color and opacity when loaded ${editable ? 'for editing' : 'as overlay'}`, async () => {
        let click;
        const recent = [];
        const styles = [];
        const added = [];
        const feature = {
            type: 'Feature',
            properties: { color: '#ff9900', fillColor: '#ff9900', fillOpacity: 0.6, rxPower: '-92.50' },
            geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }
        };
        let prompt = 0;
        const map = { fitBounds() {} };
        const drawnItems = {
            clearLayers() {},
            addLayer(layer) { added.push(layer); },
            getLayers() { return added; },
            getBounds() { return {}; }
        };
        const L = {
            geoJson(data, options) {
                if (!data) return { addTo() { return this; }, addLayer(layer) { added.push(layer); } };
                const layer = { setStyle(style) { styles.push(style); } };
                options.onEachFeature(data.features[0], layer);
                return { addTo() { return this; } };
            }
        };
        const context = {
            document: { getElementById: () => ({ addEventListener(name, callback) { click = callback; } }) },
            window: {
                location: { href: 'https://example.test/' },
                PlanMilT: {
                    welcome: { record(name) { recent.push(name); return true; } },
                    coverageImage: { clear() {}, fromFeature() { throw new Error('unexpected raster'); } },
                    apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) }
                }
            },
            Swal: { fire: async () => ++prompt === 1 ? { value: 'teste' } : { isConfirmed: editable } },
            L, map, drawnItems,
            addNewOverlayLayer() {},
            isValidGeoJson: () => true,
            console: { info() {}, error() {} }
        };
        vm.runInNewContext(source, context);
        if (editable) {
            await click();
        } else {
            prompt = 1;
            await context.window.PlanMilT.drawingLoading.load('teste');
        }
        assert.equal(added.length, 1);
        assert.equal(styles.length, 1);
        assert.equal(styles[0].color, '#ff9900');
        assert.equal(styles[0].fillColor, '#ff9900');
        assert.equal(styles[0].fillOpacity, 0.6);
        assert.equal(feature.properties.rxPower, '-92.50');
        assert.deepEqual(recent, ['teste']);
    });
}

for (const editable of [true, false]) {
    test(`restores raster coverage ${editable ? 'to the editable planning' : 'in a separate overlay'}`, async () => {
        let click;
        const raster = { type: 'Feature', geometry: null, properties: { coverageImage: { image: 'data:image/png;base64,AA==' } } };
        const restored = [];
        let cleared = false;
        let prompt = 0;
        const context = {
            document: { getElementById: () => ({ addEventListener(name, callback) { click = callback; } }) },
            window: {
                location: { href: 'https://example.test/' },
                PlanMilT: {
                    welcome: { record() { return true; } },
                    apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [raster] }) }) },
                    coverageImage: {
                        fromFeature(feature) { assert.equal(feature, raster); return { raster: true }; },
                        clear() { cleared = true; },
                        add(feature) { restored.push(feature); },
                        getGroup() { return { getBounds: () => ({}) }; }
                    }
                }
            },
            Swal: { fire: async () => ++prompt === 1 ? { value: 'teste' } : { isConfirmed: editable } },
            L: { geoJson(data) {
                if (!data) return { addTo() { return this; }, addLayer(layer) { restored.push(layer); }, getBounds() { return {}; } };
                assert.equal(data.features.length, 0);
                return { addTo() { return this; } };
            } },
            map: { fitBounds() {} },
            drawnItems: { clearLayers() {}, getLayers: () => [] },
            addNewOverlayLayer() {}, isValidGeoJson: () => true,
            console: { info() {}, error(error) { throw new Error(error); } }
        };
        vm.runInNewContext(source, context);
        await click();
        assert.equal(restored.length, 1);
        assert.equal(cleared, editable);
    });
}

test('direct recent loading does not record invalid or failed responses', async () => {
    let response = { ok: true, json: async () => ({ error: 'not found' }) };
    const recent = [];
    const alerts = [];
    const context = {
        document: { getElementById: () => ({ addEventListener() {} }) },
        window: { location: { href: 'https://example.test/' }, PlanMilT: {
            apiClient: { request: async () => response },
            welcome: { record(name) { recent.push(name); return true; } }
        } },
        Swal: { fire(...args) { alerts.push(args); } },
        isValidGeoJson: () => false,
        console: { info() {}, error() {} }
    };
    vm.runInNewContext(source, context);
    await context.window.PlanMilT.drawingLoading.load('teste');
    response = { ok: false, status: 500 };
    await context.window.PlanMilT.drawingLoading.load('teste');
    assert.deepEqual(recent, []);
    assert.equal(alerts.length, 2);
});

for (const editable of [true, false]) {
    test(`restores military symbol metadata and sizing ${editable ? 'for editing' : 'as overlay'}`, async () => {
        const data = { iconUrl: 'data:image/svg+xml,test', config: { sidc: '13031000141211000000', options: {} },
            iconSize: [90, 50], iconAnchor: [60, 25] };
        const feature = { type: 'Feature', properties: { iconUrl: data.iconUrl, militarySymbol: data },
            geometry: { type: 'Point', coordinates: [-50, -20] } };
        const restored = [];
        let icon;
        const context = {
            document: { getElementById: () => ({ addEventListener() {} }) },
            window: { location: { href: 'https://example.test/' }, PlanMilT: {
                apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) },
                welcome: { record: () => true },
                coverageImage: { clear() {} },
                militarySymbols: { createIcon(actual) { assert.equal(actual, data); return { data: actual }; } }
            } },
            Swal: { fire: async () => ({ isConfirmed: editable }) },
            L: { geoJson(input, options) {
                if (!input) return { addTo() { return this; }, addLayer(layer) { restored.push(layer); } };
                const layer = { feature, setIcon(value) { icon = value; } };
                options.onEachFeature(feature, layer);
                return { addTo() { return this; } };
            } },
            map: { fitBounds() {} },
            drawnItems: { clearLayers() {}, addLayer(layer) { restored.push(layer); }, getLayers: () => [], getBounds: () => ({}) },
            addNewOverlayLayer() {}, isValidGeoJson: () => true,
            console: { info() {}, error(error) { throw new Error(error); } }
        };
        vm.runInNewContext(source, context);
        await context.window.PlanMilT.drawingLoading.load('teste');
        assert.equal(restored.length, 1);
        assert.equal(icon.data, data);
        assert.equal(restored[0].feature.properties.militarySymbol.config.sidc, data.config.sidc);
    });
}

for (const editable of [true, false]) {
    test(`restores tactical boundary label offsets ${editable ? 'for editing' : 'as overlay'}`, async () => {
        const feature = {
            type: 'Feature',
            properties: {
                text: '1º Pel',
                role: 'boundaryLabel',
                boundaryOffset: [0, -14],
                color: '#123456'
            },
            geometry: { type: 'Point', coordinates: [-50, -20] }
        };
        const icons = [];
        let prompt = 0;
        const context = {
            document: { getElementById: () => ({ addEventListener() {} }) },
            window: {
                location: { href: 'https://example.test/' },
                PlanMilT: {
                    apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) },
                    welcome: { record: () => true },
                    coverageImage: { clear() {} },
                    tacticalGraphics: {
                        createBoundaryLabelIcon(leaflet, text, offset, color) {
                            return leaflet.divIcon({ className: 'tactical-graphic-label', text, offset, color });
                        }
                    }
                }
            },
            Swal: { fire: async () => ++prompt === 1 ? { value: 'teste' } : { isConfirmed: editable } },
            L: {
                geoJson(data, options) {
                    if (!data) return { addTo() { return this; }, addLayer() {}, getBounds() { return {}; } };
                    data.features.forEach(savedFeature => {
                        const layer = { setIcon(icon) { icons.push(icon); } };
                        options.onEachFeature(savedFeature, layer);
                    });
                    return { addTo() { return this; }, getBounds() { return {}; } };
                },
                divIcon(options) { return options; }
            },
            map: { fitBounds() {} },
            drawnItems: { clearLayers() {}, addLayer() {}, getLayers: () => [], getBounds: () => ({}) },
            addNewOverlayLayer() {},
            isValidGeoJson: () => true,
            console: { info() {}, error(error) { throw new Error(error); } }
        };

        vm.runInNewContext(source, context);
        await context.window.PlanMilT.drawingLoading.load('teste');

        assert.equal(icons.length, 1);
        assert.equal(icons[0].className, 'tactical-graphic-label');
        assert.equal(icons[0].offset.join(','), '0,-14');
        assert.equal(icons[0].text, '1º Pel');
        assert.equal(icons[0].color, '#123456');
    });
}

for (const editable of [true, false]) {
    test(`registers a persisted boundary line ${editable ? 'for editing' : 'as an overlay'}`, async () => {
        const feature = {
            type: 'Feature',
            properties: { boundaryId: 'limit-1', color: '#123456',
                tacticalGraphic: { name: 'Boundary', boundary: { type: 'Companhia', leftText: 'A', rightText: 'B', count: 2 } } },
            geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] }
        };
        const registrations = [];
        const layers = [];
        const context = {
            document: { getElementById: () => ({ addEventListener() {} }) },
            window: { location: { href: 'https://example.test/' }, PlanMilT: {
                apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) },
                welcome: { record: () => true },
                coverageImage: { clear() {} }
            } },
            tacticalGraphics: { registerBoundaryLayer(layer, canEdit) { registrations.push({ layer, canEdit: !!canEdit }); } },
            Swal: { fire: async () => ({ isConfirmed: editable }) },
            L: { geoJson(data, options) {
                if (!data) return { addTo() { return this; }, addLayer(layer) { layers.push(layer); } };
                const layer = { feature, setStyle() {} };
                options.onEachFeature(feature, layer);
                return { addTo() { return this; } };
            } },
            map: { fitBounds() {} },
            drawnItems: { clearLayers() {}, addLayer(layer) { layers.push(layer); }, getLayers: () => [], getBounds: () => ({}) },
            addNewOverlayLayer() {}, isValidGeoJson: () => true,
            console: { info() {}, error(error) { throw new Error(error); } }
        };
        vm.runInNewContext(source, context);
        await context.window.PlanMilT.drawingLoading.load('teste');
        assert.equal(registrations.length, 1);
        assert.equal(registrations[0].canEdit, editable);
        assert.equal(registrations[0].layer.feature, feature);
        assert.equal(layers.length, 1);
    });
}
