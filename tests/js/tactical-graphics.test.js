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
        this.attributes = {};
        this.listeners = new Map();
        this.classNames = new Set();
        Object.defineProperty(this, 'className', {
            get: () => Array.from(this.classNames).join(' '),
            set: value => {
                this.classNames = new Set(String(value).split(/\s+/).filter(Boolean));
            }
        });
        this.classList = {
            add: name => this.classNames.add(name),
            contains: name => this.classNames.has(name)
        };
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    replaceChildren(...children) {
        this.children = children;
        this.textContent = '';
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    getAttribute(name) {
        return this.attributes[name];
    }

    addEventListener(name, listener) {
        this.listeners.set(name, listener);
    }

    click() {
        this.listeners.get('click')?.();
    }

    dispatch(name) {
        this.listeners.get(name)?.();
    }
}

const popupElements = new Map();
global.document = {
    createElement(tagName) {
        return new FakeSelectElement(tagName);
    },
    createElementNS(namespace, tagName) {
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
    const popupElementIds = [
        'tacticalGraphicCategory',
        'tacticalGraphicSearch',
        'tacticalGraphicResults',
        'tacticalGraphicSelection'
    ];
    popupElements.clear();
    popupElementIds.forEach(id => popupElements.set(id, new FakeSelectElement('div')));
    const popup = {
        querySelector(selector) {
            const element = popupElements.get(selector.slice(1));
            assert.ok(element, `Missing popup element ${selector}`);
            return element;
        },
        classList: {
            add(name) {
                this[name] = true;
            }
        }
    };
    const library = {
        listTacticalGraphicNames: () => ['MainAxisOfAdvance'],
        getDisplayName: () => 'Eixo de avanço principal',
        TacticalGraphicCategory: { Lines: 'Lines' },
        GRAPHIC_CATEGORIES: { MainAxisOfAdvance: 'Lines', PhaseLine: 'Lines' },
        baseGeometryFor: () => geometryType,
        renderTacticalGraphic(feature) {
            renderedFeatures.push(feature);
            if (renderError
                && feature.properties.tacticalGraphic.designation !== 'Exemplo'
                && (feature.properties.tacticalGraphic.designation || '') === designation) {
                throw renderError;
            }
            if (feature.properties.tacticalGraphic.designation !== 'Exemplo'
                && feature.properties.tacticalGraphic.designation !== undefined) {
                assert.ok(['MainAxisOfAdvance', 'PhaseLine'].includes(feature.properties.tacticalGraphic.name));
                assert.equal(feature.properties.tacticalGraphic.designation, designation || undefined);
            }
            if (geometryType === 'Point') assert.equal(feature.properties.tacticalGraphic.radius, 500);
            return {
                graphic: {
                    type: 'Feature',
                    properties: { tacticalGraphic: feature.properties.tacticalGraphic, role: 'graphic' },
                    geometry: geometryType === 'Point'
                        ? { type: 'MultiPoint', coordinates: [[-50, -20]] }
                        : {
                            type: 'MultiLineString',
                            coordinates: [
                                [[-50, -20], [-49.9, -20.1]],
                                [[-49.9, -20.1], [-49.8, -20.2]]
                            ]
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
                return { isConfirmed: true, value: options.preConfirm() };
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
            const layerGroup = (childLayers, sourceFeature) => ({
                feature: sourceFeature,
                options,
                setStyle() {},
                eachLayer(callback) {
                    childLayers.forEach(callback);
                }
            });
            const primitiveLayer = sourceFeature => ({
                feature: sourceFeature,
                options,
                setStyle() {},
                editing: { enable() {}, disable() {} }
            });
            const featureLayer = sourceFeature => {
                if (sourceFeature.type === 'FeatureCollection') {
                    return layerGroup(sourceFeature.features.map(featureLayer), sourceFeature);
                }
                if (sourceFeature.geometry.type === 'MultiLineString') {
                    const lineLayers = sourceFeature.geometry.coordinates.map(coordinates =>
                        primitiveLayer({
                            ...sourceFeature,
                            geometry: { type: 'LineString', coordinates }
                        })
                    );
                    return layerGroup([layerGroup(lineLayers)], sourceFeature);
                }
                if (sourceFeature.geometry.type === 'MultiPoint') {
                    return layerGroup(sourceFeature.geometry.coordinates.map(coordinates =>
                        primitiveLayer({
                            ...sourceFeature,
                            geometry: { type: 'Point', coordinates }
                        })
                    ), sourceFeature);
                }
                return primitiveLayer(sourceFeature);
            };
            return featureLayer(feature);
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
        popupElements,
        popup,
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
    assert.match(harness.alerts[0].html, /tacticalGraphicPicker/);
    assert.equal(harness.popup.classList['tactical-graphic-modal'], true);

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
    assert.equal(harness.layers.length, 4);
    assert.equal(harness.layers[0].feature.geometry.type, 'LineString');
    assert.equal(harness.layers[1].feature.geometry.type, 'LineString');
    assert.ok(harness.layers.slice(0, 2).every(layer => layer.editing));
    assert.equal(harness.layers[2].options.icon.html, '1ª Cia');
    assert.equal(harness.integration.handleCreated({}), false);
});

test('graphic selector puts compact symbol thumbnails beside single-choice rows', async () => {
    const harness = createHarness();
    await harness.integration.startDrawing();

    const category = harness.popupElements.get('tacticalGraphicCategory');
    const search = harness.popupElements.get('tacticalGraphicSearch');
    const results = harness.popupElements.get('tacticalGraphicResults');
    assert.deepEqual(category.children.map(option => option.value), ['common', 'Lines']);
    assert.equal(category.value, 'all');
    const initialGraphicOption = results.children.find(option => option.classNames.has('tactical-graphic-result'));
    assert.ok(initialGraphicOption);
    assert.equal(initialGraphicOption.children[0].type, 'radio');
    assert.equal(initialGraphicOption.children[0].checked, true);
    const sampleLine = harness.renderedFeatures.find(feature => feature.geometry.type === 'LineString');
    assert.equal(sampleLine.geometry.coordinates.length, 2);
    assert.equal(initialGraphicOption.children[1].classNames.has('tactical-graphic-result-content'), true);
    assert.equal(initialGraphicOption.children[1].children[0].textContent, 'Eixo principal de progressão');
    assert.equal(initialGraphicOption.children[1].children[1].classNames.has('tactical-graphic-result-preview'), true);
    assert.equal(initialGraphicOption.children[1].children[1].children[0].tagName, 'svg');

    category.value = 'common';
    category.dispatch('change');
    search.value = 'eixo';
    search.dispatch('input');
    const graphicOption = results.children.find(option => option.classNames.has('tactical-graphic-result'));

    assert.ok(graphicOption);
    assert.equal(graphicOption.children[1].children[0].textContent, 'Eixo principal de progressão');
    graphicOption.children[0].checked = true;
    graphicOption.children[0].dispatch('change');

    assert.equal(graphicOption.children[1].children[1].children[0].tagName, 'svg');
    assert.equal(graphicOption.children[0].checked, true);
    assert.equal(graphicOption.classNames.has('is-selected'), true);
    assert.match(harness.popupElements.get('tacticalGraphicSelection').textContent, /Eixo principal de progressão/);
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

test('military symbology control is a Leaflet button below freehand drawing', () => {
    const container = {
        attrs: {},
        setAttribute(name, value) {
            this.attrs[name] = value;
        }
    };
    let className = '';
    const leaflet = {
        Control: {
            extend(definition) {
                return class {
                    constructor() {
                        this.options = definition.options;
                        this.onAdd = definition.onAdd;
                    }
                };
            }
        },
        DomUtil: {
            create(tag, classes) {
                className = classes;
                return container;
            }
        }
    };

    const control = window.PlanMilT.tacticalGraphics.createControl({ leaflet });
    const element = control.onAdd();

    assert.equal(control.options.position, 'topleft');
    assert.equal(element.title, 'Simbologia militar');
    assert.match(className, /leaflet-control-tactical-graphic/);
    assert.match(element.innerHTML, /fa-shield-alt/);
    assert.equal(element.attrs['aria-label'], 'Simbologia militar');
    const mainSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../js/features/main.js'), 'utf8');
    assert.doesNotMatch(mainSource, /id="tacticalGraphicButton"/);
});
