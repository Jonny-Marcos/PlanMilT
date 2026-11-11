const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/drawing-loading.js'), 'utf8');

for (const editable of [true, false]) {
    test(`saved coverage keeps its color and opacity when loaded ${editable ? 'for editing' : 'as overlay'}`, async () => {
        let click;
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
                PlanMilT: { apiClient: { request: async () => ({ ok: true, json: async () => ({ type: 'FeatureCollection', features: [feature] }) }) } }
            },
            Swal: { fire: async () => ++prompt === 1 ? { value: 'teste' } : { isConfirmed: editable } },
            L, map, drawnItems,
            addNewOverlayLayer() {},
            isValidGeoJson: () => true,
            console: { info() {}, error() {} }
        };
        vm.runInNewContext(source, context);
        await click();
        assert.equal(added.length, 1);
        assert.equal(styles.length, 1);
        assert.equal(styles[0].color, '#ff9900');
        assert.equal(styles[0].fillColor, '#ff9900');
        assert.equal(styles[0].fillOpacity, 0.6);
        assert.equal(feature.properties.rxPower, '-92.50');
    });
}
