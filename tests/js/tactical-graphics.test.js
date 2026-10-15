const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {
    setTimeout(callback) {
        callback();
    }
};
class FakeSelectElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.value = '';
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }
}

global.document = {
    createElement(tagName) {
        return new FakeSelectElement(tagName);
    }
};
require('../../js/features/tactical-graphics.js');

function createHarness({
    geometryType = 'LineString',
    designation = '1ª Cia',
    renderError = null
} = {}) {
    const layers = [];
    const mapLayers = [];
    const removedMapLayers = [];
    const renderedFeatures = [];
    const mapListeners = new Map();
    const drawTools = [];
    const alerts = [];
    let selectedName = 'MainAxisOfAdvance';
    const graphicSelect = new FakeSelectElement('select');
    graphicSelect.value = selectedName;
    const popup = {
        querySelector(selector) {
            assert.equal(selector, '#tactical-graphic-select');
            return graphicSelect;
        }
    };
    const library = {
        listTacticalGraphicNames: () => ['MainAxisOfAdvance'],
        getDisplayName: () => 'Eixo de avanço principal',
        baseGeometryFor: () => geometryType,
        renderTacticalGraphic(feature) {
            renderedFeatures.push(feature);
            if (renderError) throw renderError;
            assert.equal(feature.properties.tacticalGraphic.name, 'MainAxisOfAdvance');
            assert.equal(
                feature.properties.tacticalGraphic.designation,
                designation || undefined
            );
            if (geometryType === 'Point') assert.equal(feature.properties.tacticalGraphic.radius, 500);
            return {
                graphic: {
                    type: 'Feature',
                    properties: { tacticalGraphic: feature.properties.tacticalGraphic, role: 'graphic' },
                    geometry: {
                        type: 'MultiLineString',
                        coordinates: [[[-50, -20], [-49.9, -20.1]]]
                    }
                },
                labels: {
                    type: 'Feature',
                    properties: { tacticalGraphic: feature.properties.tacticalGraphic, role: 'label' },
                    geometry: {
                        type: 'MultiPoint',
                        coordinates: [[-50, -20], [-49.9, -20.1]]
                    }
                }
            };
        }
    };
    const sweetAlert = {
        async fire(options) {
            alerts.push(options);
            if (options.icon === 'error') return { isConfirmed: true };
            if (options.didOpen) {
                options.didOpen();
                options.preConfirm();
                return { isConfirmed: true, value: selectedName };
            }
            return { isConfirmed: true, value: designation };
        },
        getPopup() {
            return popup;
        },
        showValidationMessage(message) {
            throw new Error(message);
        }
    };
    const button = {
        addEventListener(eventName, handler) {
            assert.equal(eventName, 'click');
            this.clickHandler = handler;
        }
    };
    const leaflet = {
        Draw: {
            Marker: class {
                constructor(map, options) {
                    drawTools.push({ geometryType: 'Point', map, options });
                }
                enable() {
                    drawTools.at(-1).enabled = true;
                }
            },
            Polyline: class {
                constructor(map, options) {
                    drawTools.push({ geometryType: 'LineString', map, options });
                }
                enable() {
                    drawTools.at(-1).enabled = true;
                }
            },
            Polygon: class {
                constructor(map, options) {
                    drawTools.push({ geometryType: 'Polygon', map, options });
                }
                enable() {
                    drawTools.at(-1).enabled = true;
                }
            }
        },
        geoJSON(feature, options) {
            return {
                feature,
                options,
                eachLayer(callback) {
                    callback({ feature, options, setStyle() {} });
                }
            };
        },
        circleMarker(latlng, options) {
            return { latlng, options, setStyle() {} };
        },
        marker(latlng, options) {
            return { latlng, options };
        },
        divIcon(options) {
            return options;
        }
    };
    const map = {
        on(eventName, listener) {
            mapListeners.set(eventName, listener);
        },
        addLayer(layer) {
            mapLayers.push(layer);
        },
        removeLayer(layer) {
            removedMapLayers.push(layer);
        }
    };
    const drawnItems = {
        addLayer(layer) {
            layers.push(layer);
        }
    };

    const integration = window.PlanMilT.tacticalGraphics.attach({
        map,
        leaflet,
        library,
        catalog: {
            buildSections() {
                return [
                    {
                        name: 'common',
                        label: '10 mais comuns',
                        graphics: [{ name: 'MainAxisOfAdvance', label: 'Eixo principal de progressão' }]
                    },
                    {
                        name: 'Lines',
                        label: 'Linhas',
                        graphics: [{ name: 'PhaseLine', label: 'Linha de fase' }]
                    }
                ];
            },
            translateName: () => 'Eixo principal de progressão'
        },
        drawnItems,
        button,
        sweetAlert,
        getDefaultColor: () => '#123456'
    });

    return {
        alerts,
        button,
        integration,
        drawTools,
        graphicSelect,
        layers,
        mapLayers,
        mapListeners,
        removedMapLayers,
        renderedFeatures
    };
}

test('selecting a line graphic starts native Leaflet drawing and adds rendered geometry and labels', async () => {
    const harness = createHarness();
    await harness.integration.startDrawing();

    assert.equal(harness.drawTools[0].geometryType, 'LineString');
    assert.equal(harness.drawTools[0].enabled, true);
    assert.equal(harness.drawTools[0].options.shapeOptions.color, '#123456');
    assert.match(harness.alerts[0].html, /tactical-graphic-select/);
    assert.equal(harness.graphicSelect.children[0].label, '10 mais comuns');
    assert.equal(harness.graphicSelect.children[0].children[0].textContent, 'Eixo principal de progressão');
    assert.equal(harness.graphicSelect.children[1].label, 'Linhas');

    const handled = harness.integration.handleCreated({
        layer: {
            toGeoJSON: () => ({
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: [[-50, -20], [-49.9, -20.1]]
                }
            })
        }
    });

    assert.equal(handled, true);
    assert.equal(harness.layers.length, 3);
    assert.equal(harness.layers[0].feature.properties.color, '#123456');
    assert.equal(harness.layers[1].options.icon.html, '1ª Cia');
    assert.equal(harness.integration.handleCreated({}), false);
});

test('point graphics use the native marker tool and carry the default range', async () => {
    const harness = createHarness({ geometryType: 'Point', designation: '' });
    await harness.integration.startDrawing();

    assert.equal(harness.drawTools[0].geometryType, 'Point');
    assert.equal(harness.drawTools[0].enabled, true);

    harness.integration.handleCreated({
        layer: {
            toGeoJSON: () => ({
                type: 'Feature',
                properties: {},
                geometry: { type: 'Point', coordinates: [-50, -20] }
            })
        }
    });

    assert.equal(harness.layers.length, 1);
});

test('drawing displays a live tactical-symbol preview that is removed when drawing stops', async () => {
    const harness = createHarness();
    await harness.integration.startDrawing();
    harness.mapListeners.get('draw:drawvertex')({
        layers: {
            eachLayer(callback) {
                callback({ getLatLng: () => ({ lat: -20, lng: -50 }) });
                callback({ getLatLng: () => ({ lat: -20.05, lng: -49.95 }) });
            }
        }
    });
    assert.equal(harness.mapLayers.length, 1);
    assert.deepEqual(harness.renderedFeatures.at(-1).geometry.coordinates, [
        [-50, -20],
        [-49.95, -20.05]
    ]);

    harness.mapListeners.get('mousemove')({
        latlng: { lat: -20.1, lng: -49.9 }
    });

    assert.equal(harness.mapLayers.length, 2);
    assert.equal(harness.mapLayers[1].feature.type, 'FeatureCollection');
    assert.equal(harness.mapLayers[1].feature.features[0].properties.role, 'graphic');
    assert.equal(harness.mapLayers[1].feature.features[1].properties.role, 'label');
    assert.deepEqual(harness.renderedFeatures.at(-1).geometry.coordinates, [
        [-50, -20],
        [-49.95, -20.05],
        [-49.9, -20.1]
    ]);
    assert.equal(harness.layers.length, 0);

    harness.mapListeners.get('draw:drawstop')();

    assert.equal(harness.removedMapLayers.length, 2);
    assert.equal(harness.removedMapLayers[0], harness.mapLayers[0]);
    assert.equal(harness.removedMapLayers[1], harness.mapLayers[1]);
});

test('polygon previews use the committed vertices and the current cursor', async () => {
    const harness = createHarness({ geometryType: 'Polygon', designation: '' });
    await harness.integration.startDrawing();
    harness.mapListeners.get('draw:drawvertex')({
        layers: {
            eachLayer(callback) {
                callback({ getLatLng: () => ({ lat: -20, lng: -50 }) });
                callback({ getLatLng: () => ({ lat: -20, lng: -49.95 }) });
                callback({ getLatLng: () => ({ lat: -20.05, lng: -49.95 }) });
            }
        }
    });

    assert.equal(harness.mapLayers.length, 1);
    assert.deepEqual(harness.renderedFeatures.at(-1).geometry, {
        type: 'Polygon',
        coordinates: [[[-50, -20], [-49.95, -20], [-49.95, -20.05], [-50, -20]]]
    });

    harness.mapListeners.get('mousemove')({
        latlng: { lat: -20.05, lng: -50 }
    });

    assert.deepEqual(harness.renderedFeatures.at(-1).geometry.coordinates[0], [
        [-50, -20],
        [-49.95, -20],
        [-49.95, -20.05],
        [-50, -20.05],
        [-50, -20]
    ]);
});

test('renderer errors are surfaced to the user and consumed', async () => {
    const harness = createHarness({ renderError: new Error('Falha de renderização') });
    await harness.integration.startDrawing();

    const handled = harness.integration.handleCreated({
        layer: {
            toGeoJSON: () => ({
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: [[-50, -20], [-49.9, -20.1]]
                }
            })
        }
    });

    assert.equal(handled, true);
    assert.equal(harness.alerts.at(-1).title, 'Não foi possível gerar o gráfico');
    assert.equal(harness.layers.length, 0);
});
