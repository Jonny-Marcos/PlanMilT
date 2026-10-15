const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};

const layerSelector = {
    children: [],
    value: 'OpenTopo',
    set innerHTML(value) {
        this.children = [];
    },
    appendChild(option) { this.children.push(option); },
    addEventListener(eventName, handler) {
        this.listeners = this.listeners || {};
        this.listeners[eventName] = handler;
    }
};
const transparencySlider = {
    value: '100',
    addEventListener(eventName, handler) {
        this.listeners = this.listeners || {};
        this.listeners[eventName] = handler;
    }
};

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
    assert.deepEqual(layerSelector.children.map(option => option.value), Object.keys(setup.layerRegistry));
    assert.equal(layersOnMap.has(setup.planejamentoLayer), false);
    assert.equal(typeof setup.layerControl.addOverlay, 'function');
});

test('new overlays are registered, added to the control and map once', () => {
    const { layersOnMap, overlays, setup } = createMapSetup();
    const overlay = {
        id: 'custom-layer',
        setOpacity(value) { this.opacity = value; }
    };

    setup.addNewOverlayLayer('Custom', overlay);
    assert.equal(setup.layerRegistry.Custom, overlay);
    assert.equal(overlays.get('Custom'), overlay);
    assert.equal(layersOnMap.has(overlay), true);
    assert.equal(layerSelector.children.some(option => option.value === 'Custom'), true);

    layerSelector.value = 'Custom';
    transparencySlider.value = '45';
    transparencySlider.listeners.input();
    assert.equal(overlay.opacity, 0.45);

    const warning = console.warn;
    console.warn = () => {};
    try {
        setup.addNewOverlayLayer('Custom', { id: 'duplicate' });
    } finally {
        console.warn = warning;
    }
    assert.equal(setup.layerRegistry.Custom, overlay);
});

test('removing an overlay also removes it from the transparency selector', () => {
    const { layersOnMap, overlays, setup } = createMapSetup();
    const overlay = { id: 'custom-layer' };

    setup.addNewOverlayLayer('Custom', overlay);
    layerSelector.value = 'Custom';
    setup.removeOverlayLayer('Custom');

    assert.equal(setup.layerRegistry.Custom, undefined);
    assert.equal(overlays.has('Custom'), false);
    assert.equal(layersOnMap.has(overlay), false);
    assert.equal(layerSelector.children.some(option => option.value === 'Custom'), false);
    assert.notEqual(layerSelector.value, 'Custom');
});