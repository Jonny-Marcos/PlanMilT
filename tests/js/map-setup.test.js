const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};

const layerSelector = {
    children: [],
    value: 'OpenTopo',
    innerHTML: '',
    appendChild(option) { this.children.push(option); },
    addEventListener() {}
};
const transparencySlider = { value: '100', addEventListener() {} };

global.document = {
    getElementById(id) {
        if (id === 'layerSelector') return layerSelector;
        if (id === 'transparencySlider') return transparencySlider;
        throw new Error(`Unexpected element id: ${id}`);
    }
};
global.Option = class {
    constructor(text, value) {
        this.text = text;
        this.value = value;
    }
};

require('../../js/features/map-setup.js');

function createMapSetup() {
    const layersOnMap = new Set();
    const panes = new Map();
    const overlays = new Map();
    const map = {
        createPane(name) { panes.set(name, { style: {} }); },
        getPane(name) { return panes.get(name); },
        addLayer(layer) { layersOnMap.add(layer); },
        removeLayer(layer) { layersOnMap.delete(layer); },
        hasLayer(layer) { return layersOnMap.has(layer); }
    };

    const makeLayer = (type, url, options) => ({ type, url, options, addTo(targetMap) { targetMap.addLayer(this); return this; } });
    const layerControl = {
        addTo(targetMap) { targetMap.addLayer(this); return this; },
        getContainer() { return { style: {}, innerHTML: '' }; },
        addOverlay(layer, name) { overlays.set(name, layer); },
        _update() {},
        removeLayer(layer) { for (const [name, value] of overlays) if (value === layer) overlays.delete(name); }
    };
    const leaflet = {
        CRS: { EPSG4326: 'EPSG4326' },
        svg: { tile: {} },
        tileLayer: Object.assign((url, options) => makeLayer('tile', url, options), {
            wms: (url, options) => makeLayer('wms', url, options)
        }),
        vectorGrid: { protobuf: (url, options) => makeLayer('vector', url, options) },
        layerGroup: () => ({ layers: [], addLayer(layer) { this.layers.push(layer); } }),
        utmGrid: zone => ({ zone }),
        featureGroup: () => ({ addTo(targetMap) { targetMap.addLayer(this); return this; } }),
        ImageOverlay: { include() {} },
        control: { layers: () => layerControl },
        DomUtil: { create(tagName, className, parent) { return { tagName, className, parent, style: {}, innerHTML: '' }; } },
        DomEvent: { disableClickPropagation() {}, on() {}, stopPropagation() {} }
    };

    const setup = window.PlanMilT.mapSetup.attach({ map, leaflet });
    return { layersOnMap, layerControl, overlays, setup };
}

test('setup returns standard layers and planning state in its registry', () => {
    const { layersOnMap, setup } = createMapSetup();

    assert.deepEqual(Object.keys(setup.layerRegistry), [
        'OpenTopo',
        'Google Satellite',
        'Infraestruturas',
        'Quadrículas - UTM',
        'BDGEx - CTM50',
        'Sugestão de Planejamento'
    ]);
    assert.equal(layersOnMap.has(setup.planejamentoLayer), false);
    assert.equal(typeof setup.layerControl.addOverlay, 'function');
});

test('new overlays are registered, added to the control and map once', () => {
    const { layersOnMap, overlays, setup } = createMapSetup();
    const overlay = { id: 'custom-layer' };

    setup.addNewOverlayLayer('Custom', overlay);
    assert.equal(setup.layerRegistry.Custom, overlay);
    assert.equal(overlays.get('Custom'), overlay);
    assert.equal(layersOnMap.has(overlay), true);

    const warning = console.warn;
    console.warn = () => {};
    try {
        setup.addNewOverlayLayer('Custom', { id: 'duplicate' });
    } finally {
        console.warn = warning;
    }
    assert.equal(setup.layerRegistry.Custom, overlay);
});