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
        this.style = {};
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
    },
    querySelector(selector) {
        const element = popupElements.get(selector.slice(1));
        return element || null;
    }
};
require('../../js/features/tactical-graphics.js');
require('../../js/features/drawing-geometry.js');
window.PlanMilT.localHistory = { graphics: () => [], recordGraphic() {} };

test('boundary label icon is centered with escaped text and its screen offset', () => {
    const icon = window.PlanMilT.tacticalGraphics.createBoundaryLabelIcon(
        { divIcon: options => options },
        '<1º Pel>',
        [4, -14],
        '#123456'
    );

    assert.equal(icon.className, 'tactical-graphic-label');
    assert.equal(icon.iconSize.join(','), '0,0');
    assert.equal(icon.iconAnchor.join(','), '0,0');
    assert.match(icon.html, /translate\(4px,-14px\)/);
    assert.match(icon.html, /&lt;1º Pel&gt;/);
});

function createHarness({
    geometryType = 'LineString',
    designation = '1ª Cia',
    renderError = null,
    graphicName = 'MainAxisOfAdvance',
    boundaryType = 'Companhia',
    boundaryCount = 1,
    coordinationDiameter = 100,
    emptyFrequent = false
} = {}) {
    const recordedGraphics = [];
    window.PlanMilT.localHistory = { graphics: () => [], recordGraphic: name => recordedGraphics.push(name) };
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
        'tacticalGraphicSelection',
        'tacticalGraphicDesignation',
        'tacticalGraphicBoundaryEditor',
        'tacticalGraphicBoundaryType',
        'tacticalGraphicBoundaryLeft',
        'tacticalGraphicBoundaryRight',
        'tacticalGraphicBoundaryCount',
        'tacticalGraphicCoordinationField',
        'tacticalGraphicCoordinationDiameter'
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
        listTacticalGraphicNames: () => [graphicName],
        getDisplayName: () => 'Eixo de avanço principal',
        TacticalGraphicCategory: { Lines: 'Lines' },
        GRAPHIC_CATEGORIES: { MainAxisOfAdvance: 'Lines', PhaseLine: 'Lines', Boundary: 'Lines' },
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
                assert.ok(['MainAxisOfAdvance', 'PhaseLine', 'Boundary'].includes(feature.properties.tacticalGraphic.name));
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
                popupElements.get('tacticalGraphicDesignation').value = designation;
                popupElements.get('tacticalGraphicBoundaryType').value = boundaryType;
                popupElements.get('tacticalGraphicBoundaryLeft').value = '1ª Cia';
                popupElements.get('tacticalGraphicBoundaryRight').value = '2ª Cia';
                popupElements.get('tacticalGraphicBoundaryCount').value = String(boundaryCount);
                popupElements.get('tacticalGraphicCoordinationDiameter').value = String(coordinationDiameter);
                options.didOpen();
                return { isConfirmed: true, value: options.preConfirm() };
            }
            if (sweetAlert.cancelEdit) return { isConfirmed: false };
            if (sweetAlert.validateEdit) return { isConfirmed: true, value: options.preConfirm() };
            if (sweetAlert.editValue) return { isConfirmed: true, value: sweetAlert.editValue };
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
            const primitiveLayer = sourceFeature => {
                const listeners = new Map();
                return {
                    feature: sourceFeature,
                    options: {},
                    setStyle(style) { Object.assign(this.options, style); },
                    redraw() { this.redrawn = true; },
                    toGeoJSON() { return this.feature; },
                    on(name, callback) { listeners.set(name, callback); },
                    fire(name) { return listeners.get(name)?.({ target: this }); },
                    editing: { enable() {}, disable() {} }
                };
            };
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
        scale: 10000,
        on(eventName, listener) {
            mapListeners.set(eventName, listener);
        },
        off(eventName) {
            mapListeners.delete(eventName);
        },
        project([lat, lng]) { return { x: lng * this.scale, y: -lat * this.scale }; },
        unproject([x, y]) { return { lng: x / this.scale, lat: -y / this.scale }; },
        hasLayer(layer) { return mapLayers.includes(layer) && !removedMapLayers.includes(layer); },
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
            if (!map.hasLayer(layer)) layer.fire?.('add');
        },
        removeLayer(layer) {
            const index = layers.indexOf(layer);
            if (index >= 0) layers.splice(index, 1);
            layer.fire?.('remove');
        },
        eachLayer(callback) { [...layers].forEach(callback); }
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
                        graphics: emptyFrequent ? [] : [{
                            name: graphicName,
                            label: graphicName === 'Boundary' ? 'Limite' : 'Eixo principal de progressão'
                        }]
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
        sweetAlert,
        leaflet,
        drawnItems,
        map,
        layers,
        mapLayers,
        mapListeners,
        removedMapLayers,
        renderedFeatures,
        recordedGraphics
    };
}

test('selecting a line graphic starts native Leaflet drawing and adds rendered geometry and labels', async () => {
    const harness = createHarness();
    await harness.integration.startDrawing();

    assert.equal(harness.drawTools[0].geometryType, 'LineString');
    assert.equal(harness.drawTools[0].enabled, true);
    assert.equal(harness.drawTools[0].options.shapeOptions.color, '#123456');
    assert.match(harness.alerts[0].html, /tacticalGraphicPicker/);
    assert.match(harness.alerts[0].html, /Designação \(opcional\)/);
    assert.match(harness.alerts[0].html, /Batalhão/);
    assert.match(harness.alerts[0].html, /Regimento/);
    assert.match(harness.alerts[0].html, /Brigada/);
    assert.match(harness.alerts[0].html, /Exército/);
    assert.match(harness.alerts[0].html, /tacticalGraphicSelection[\s\S]*tacticalGraphicDesignation/);
    assert.equal(harness.popupElements.get('tacticalGraphicDesignation').value, '1ª Cia');
    assert.equal(harness.alerts.length, 1);
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
    assert.deepEqual(harness.recordedGraphics, ['MainAxisOfAdvance']);
    assert.equal(harness.integration.handleCreated({}), false);
});

test('boundary limits keep the side names and can be edited after creation', async () => {
    const harness = createHarness();
    const feature = {
        type: 'Feature',
        properties: {
            tacticalGraphic: {
                name: 'Boundary',
                designation: '1ª Cia',
                boundary: { type: 'Companhia', leftText: '1ª Cia', rightText: '2ª Cia' }
            }
        }
    };

    const updated = await harness.integration.editGraphic(feature);
    assert.equal(updated, true);
    assert.equal(feature.properties.tacticalGraphic.boundary.type, 'Companhia');
    assert.equal(feature.properties.tacticalGraphic.boundary.leftText, '1ª Cia');
    assert.equal(feature.properties.tacticalGraphic.boundary.rightText, '2ª Cia');
    assert.equal(feature.properties.name, '1ª Cia / 2ª Cia');
});

test('boundary echelon symbols stay centered and side names face opposite sides of the line', async () => {
    const expectedSymbols = new Map([
        ['Pelotão', '●●●'],
        ['Companhia', 'I'],
        ['Batalhão', 'II'],
        ['Regimento', 'III'],
        ['Brigada', 'X'],
        ['Divisão', 'XX'],
        ['Exército', 'XXX']
    ]);

    for (const [boundaryType, expectedSymbol] of expectedSymbols) {
        const harness = createHarness({
            graphicName: 'Boundary',
            designation: '',
            boundaryType
        });
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
        const mark = harness.layers.find(layer => layer.feature?.properties?.role === 'boundaryMark').feature;
        assert.equal(mark.properties.text, expectedSymbol);
        assert.deepEqual(mark.geometry.coordinates, [-49.95, -20.05]);

        const boundaryLabels = harness.layers.filter(layer => layer.feature?.properties?.role === 'boundaryLabel');
        assert.equal(boundaryLabels.length, 2);
        assert.deepEqual(
            boundaryLabels.map(layer => layer.feature.geometry.coordinates),
            [[-49.95, -20.05], [-49.95, -20.05]]
        );
        const [leftOffset, rightOffset] = boundaryLabels.map(layer => layer.feature.properties.boundaryOffset);
        assert.ok(Math.abs(leftOffset[0] + rightOffset[0]) < 1e-10);
        assert.ok(Math.abs(leftOffset[1] + rightOffset[1]) < 1e-10);
        assert.match(boundaryLabels[0].options.icon.html, /translate\(-50%,-50%\)/);
    }
});

test('boundary repeats complete symbols in transparent line gaps and regenerates them on edit', async () => {
    const harness = createHarness({ graphicName: 'Boundary', designation: '', boundaryType: 'Pelotão', boundaryCount: 3 });
    await harness.integration.startDrawing();
    assert.match(harness.alerts[0].html, /Quantidade de símbolos/);
    const geometry = { type: 'LineString', coordinates: [[0, 0], [0.12, 0]] };
    harness.integration.handleCreated({
        layer: { toGeoJSON: () => ({ type: 'Feature', properties: {}, geometry }) }
    });

    const line = harness.layers.find(layer => layer.feature?.geometry.type === 'LineString');
    let marks = harness.layers.filter(layer => layer.feature?.properties?.role === 'boundaryMark');
    assert.equal(marks.length, 3);
    assert.deepEqual(marks.map(layer => layer.feature.geometry.coordinates[0]), [0.02, 0.06, 0.1]);
    assert.deepEqual(line.options.dashArray.split(' ').map(Number), [182, 36, 364, 36, 364, 36, 182, 0]);
    assert.equal(line.options.lineCap, 'butt');
    assert.equal(line.options.noClip, true);
    assert.equal(line.options.smoothFactor, 0);
    assert.deepEqual(line.toGeoJSON().geometry, geometry);
    assert.equal(harness.layers.filter(layer => layer.feature?.properties?.role === 'boundaryLabel').length, 6);

    harness.sweetAlert.editValue = {
        designation: '',
        boundary: { type: 'Companhia', leftText: 'A', rightText: 'B', count: 2 }
    };
    line.fire('click');
    await new Promise(resolve => setImmediate(resolve));
    marks = harness.layers.filter(layer => layer.feature?.properties?.role === 'boundaryMark');
    assert.deepEqual(marks.map(layer => layer.feature.properties.text), ['I', 'I']);
    assert.deepEqual(marks.map(layer => layer.feature.geometry.coordinates[0]), [0.03, 0.09]);
    assert.deepEqual(harness.layers.filter(layer => layer.feature?.properties?.role === 'boundaryLabel')
        .map(layer => layer.feature.properties.text), ['A', 'B', 'A', 'B']);
    assert.equal(line.feature.properties.tacticalGraphic.boundary.count, 2);
    assert.deepEqual(line.options.dashArray.split(' ').map(Number), [282, 36, 564, 36, 282, 0]);
    harness.map.scale = 20000;
    harness.mapListeners.get('zoomend')();
    assert.deepEqual(line.options.dashArray.split(' ').map(Number), [582, 36, 1164, 36, 582, 0]);
    harness.map.scale = 200;
    harness.mapListeners.get('zoomend')();
    assert.deepEqual(line.options.dashArray.split(' ').map(Number), [0, 24, 0, 0]);
    harness.map.scale = 10000;

    line.feature.geometry = { type: 'LineString', coordinates: [[0, 0], [0.24, 0]] };
    harness.mapListeners.get('draw:edited')({ layers: { eachLayer: callback => callback(line) } });
    marks = harness.layers.filter(layer => layer.feature?.properties?.role === 'boundaryMark');
    assert.deepEqual(marks.map(layer => layer.feature.geometry.coordinates[0]), [0.06, 0.18]);
    harness.mapListeners.get('draw:deleted')({ layers: { eachLayer: callback => callback(line) } });
    assert.equal(harness.layers.length, 0);
});

test('a saved and reloaded boundary remains editable without altering another boundary', async () => {
    const original = createHarness({ graphicName: 'Boundary', designation: '', boundaryCount: 2 });
    await original.integration.startDrawing();
    original.integration.handleCreated({
        layer: { toGeoJSON: () => ({
            type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [0.12, 0]] }
        }) }
    });
    const saved = JSON.parse(JSON.stringify(original.layers.map(layer => layer.feature)));
    const restored = createHarness();
    saved.forEach(feature => {
        if (feature.geometry.type === 'LineString') {
            const group = restored.leaflet.geoJSON(feature, {});
            restored.integration.registerBoundaryLayer(group, true);
            restored.drawnItems.addLayer(group);
        } else {
            const marker = restored.leaflet.marker([feature.geometry.coordinates[1], feature.geometry.coordinates[0]], {});
            marker.feature = feature;
            restored.drawnItems.addLayer(marker);
        }
    });
    const line = restored.layers.find(layer => layer.feature.geometry.type === 'LineString');
    const otherMarker = restored.leaflet.marker([0, 0], {});
    otherMarker.feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { role: 'boundaryMark', boundaryId: 'other' } };
    restored.drawnItems.addLayer(otherMarker);
    restored.sweetAlert.editValue = {
        designation: '',
        boundary: { type: 'Divisão', leftText: 'Norte', rightText: 'Sul', count: 1 }
    };
    line.fire('click');
    await new Promise(resolve => setImmediate(resolve));
    const marks = restored.layers.filter(layer => layer.feature.properties.role === 'boundaryMark');
    assert.equal(marks.length, 2);
    assert.ok(marks.some(layer => layer.feature.properties.text === 'XX'));
    assert.ok(marks.includes(otherMarker));
    assert.equal(line.feature.properties.tacticalGraphic.boundary.count, 1);
});

test('converts an already visible freehand line into an editable boundary without replacing it', async () => {
    const harness = createHarness();
    const geometry = { type: 'LineString', coordinates: [[0, 0], [0.031234567, 0.02], [0.12, 0]] };
    const line = harness.leaflet.geoJSON({ type: 'Feature', properties: {}, geometry }, {});
    line.options.color = '#aabbcc';
    harness.map.addLayer(line);
    harness.sweetAlert.editValue = {
        designation: '',
        boundary: { type: 'Pelotão', leftText: '1º Pel', rightText: '2º Pel', count: 2 }
    };

    assert.equal(await harness.integration.convertLineToBoundary(line), true);
    assert.equal(harness.alerts[0].title, 'Editar limite');
    assert.match(harness.alerts[0].html, /tacticalGraphicBoundaryCount/);
    assert.equal(harness.layers[0], line);
    assert.deepEqual(harness.recordedGraphics, ['Boundary']);
    assert.equal(line.redrawn, true);
    assert.deepEqual(line.toGeoJSON(false).geometry, geometry);
    assert.equal(line.feature.properties.color, '#aabbcc');
    assert.equal(line.feature.properties.tacticalGraphic.boundary.count, 2);
    assert.equal(harness.layers.filter(layer => layer.feature?.properties?.role === 'boundaryMark').length, 2);
    const originalDash = line.options.dashArray;
    harness.map.scale = 20000;
    harness.mapListeners.get('zoomend')();
    assert.notEqual(line.options.dashArray, originalDash);

    harness.sweetAlert.editValue = {
        designation: '',
        boundary: { type: 'Companhia', leftText: 'A', rightText: 'B', count: 1 }
    };
    line.fire('click');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.layers.filter(layer => layer.feature?.properties?.role === 'boundaryMark')[0].feature.properties.text, 'I');
});

test('cancelling boundary configuration leaves the original line untouched', async () => {
    const harness = createHarness();
    const feature = { type: 'Feature', properties: { name: 'original' },
        geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] } };
    const line = harness.leaflet.geoJSON(feature, {});
    harness.sweetAlert.cancelEdit = true;
    assert.equal(await harness.integration.convertLineToBoundary(line), false);
    assert.equal(line.feature, feature);
    assert.deepEqual(line.feature.properties, { name: 'original' });
    assert.equal(harness.layers.length, 0);
    assert.deepEqual(harness.recordedGraphics, []);
});

test('boundary conversion validates editor fields and uses the selected values', async () => {
    const harness = createHarness();
    const line = harness.leaflet.geoJSON({
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] }
    }, {});
    harness.sweetAlert.validateEdit = true;
    harness.popupElements.get('tacticalGraphicBoundaryType').value = 'Pelotão';
    harness.popupElements.get('tacticalGraphicBoundaryLeft').value = '1º Pel';
    harness.popupElements.get('tacticalGraphicBoundaryRight').value = '2º Pel';
    harness.popupElements.get('tacticalGraphicBoundaryCount').value = '101';
    await assert.rejects(harness.integration.convertLineToBoundary(line), /quantidade inteira/);
    assert.match(harness.alerts[0].html, /value="Companhia" selected/);
    assert.equal(harness.layers.length, 0);

    harness.popupElements.get('tacticalGraphicBoundaryCount').value = '3';
    assert.equal(await harness.integration.convertLineToBoundary(line), true);
    assert.deepEqual(line.feature.properties.tacticalGraphic.boundary,
        { type: 'Pelotão', leftText: '1º Pel', rightText: '2º Pel', count: 3 });
});

test('rejects degenerate boundary geometry without modifying the line', async () => {
    const harness = createHarness();
    const feature = { type: 'Feature', properties: {},
        geometry: { type: 'LineString', coordinates: [[0, 0], [0, 0]] } };
    const line = harness.leaflet.geoJSON(feature, {});
    harness.sweetAlert.editValue = {
        designation: '',
        boundary: { type: 'Companhia', leftText: 'A', rightText: 'B', count: 1 }
    };
    await assert.rejects(harness.integration.convertLineToBoundary(line), /pelo menos dois pontos distintos/);
    assert.equal(line.feature, feature);
    assert.equal(harness.layers.length, 0);
});

test('boundary drawing preview shows all repetitions and gaps', async () => {
    const harness = createHarness({ graphicName: 'Boundary', designation: '', boundaryCount: 2 });
    await harness.integration.startDrawing();
    harness.mapListeners.get('draw:drawvertex')({
        layers: { eachLayer(callback) {
            callback({ getLatLng: () => ({ lat: 0, lng: 0 }) });
            callback({ getLatLng: () => ({ lat: 0, lng: 0.12 }) });
        } }
    });
    const preview = harness.mapLayers[0];
    const features = preview.feature.features;
    assert.equal(features.filter(feature => feature.properties.role === 'boundaryMark').length, 2);
    assert.equal(features.filter(feature => feature.properties.role === 'boundaryLabel').length, 4);
    assert.deepEqual(preview.options.style(features[0]).dashArray.split(' ').map(Number), [282, 36, 564, 36, 282, 0]);
});

test('legacy boundary annotations are linked only to their contiguous matching line', () => {
    const harness = createHarness();
    const boundary = { type: 'Pelotão', leftText: 'A', rightText: 'B' };
    const line = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 0]] },
        properties: { tacticalGraphic: { name: 'Boundary', boundary } } };
    const mark = { type: 'Feature', geometry: { type: 'Point', coordinates: [0.5, 0] },
        properties: { role: 'boundaryMark', tacticalGraphic: { boundary } } };
    const label = { type: 'Feature', geometry: { type: 'Point', coordinates: [0.5, 0] },
        properties: { role: 'boundaryLabel', tacticalGraphic: { name: 'Boundary', boundary } } };
    const unrelated = { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} };
    const collection = { type: 'FeatureCollection', features: [line, mark, label, unrelated] };
    const migrated = harness.integration.prepareLegacyBoundaries(collection);
    assert.equal(migrated.size, 1);
    assert.equal(mark.properties.boundaryId, line.properties.boundaryId);
    assert.equal(label.properties.boundaryId, line.properties.boundaryId);
    assert.equal(unrelated.properties.boundaryId, undefined);
    assert.equal(harness.integration.prepareLegacyBoundaries(collection).size, 0);
});

test('boundary repetition count requires an integer from 1 to 100', async () => {
    for (const boundaryCount of [0, 1.5, 101]) {
        const harness = createHarness({ graphicName: 'Boundary', designation: '', boundaryCount });
        await assert.rejects(harness.integration.startDrawing(), /quantidade inteira de símbolos entre 1 e 100/);
        assert.equal(harness.drawTools.length, 0);
    }
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

test('graphic selector omits the frequent filter until there is usage history', async () => {
    const harness = createHarness({ emptyFrequent: true });
    await harness.integration.startDrawing();
    assert.deepEqual(harness.popupElements.get('tacticalGraphicCategory').children.map(option => option.value), ['Lines']);
    assert.ok(harness.popupElements.get('tacticalGraphicResults').children.some(
        option => option.classNames.has('tactical-graphic-result')
    ));
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

test('coordination point uses a user-defined diameter and circle-touching diagonals', async () => {
    const harness = createHarness({ graphicName: 'CoordinationPoint', designation: '', coordinationDiameter: 200 });
    await harness.integration.startDrawing();
    assert.equal(harness.drawTools[0].geometryType, 'Point');
    assert.equal(harness.popupElements.get('tacticalGraphicCoordinationField').style.display, 'grid');
    assert.match(harness.alerts[0].html, /Diâmetro \(metros\)/);
    harness.integration.handleCreated({ layer: { toGeoJSON: () => ({
        type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-50, -20] }
    }) } });
    const feature = harness.layers[0].feature;
    assert.equal(feature.properties.tacticalGraphic.diameter, 200);
    assert.equal(feature.geometry.type, 'LineString');
    const points = feature.geometry.coordinates;
    assert.equal(points.length, 84);
    assert.deepEqual(points[0], points[64]);
    assert.deepEqual(points[65], points[32]);
    assert.deepEqual(points[83], points[16]);
    assert.deepEqual(harness.recordedGraphics, ['CoordinationPoint']);
    const radiusLat = 100 / 6378137 * 180 / Math.PI;
    assert.ok(Math.abs((Math.max(...points.map(point => point[1])) + 20) - radiusLat) < 1e-10);
});

test('coordination point rejects invalid diameters before starting the draw tool', async () => {
    for (const coordinationDiameter of [0, -1, 100001]) {
        const harness = createHarness({ graphicName: 'CoordinationPoint', designation: '', coordinationDiameter });
        await assert.rejects(harness.integration.startDrawing(), /diâmetro entre/);
        assert.equal(harness.drawTools.length, 0);
    }
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
    assert.deepEqual(harness.recordedGraphics, []);
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
