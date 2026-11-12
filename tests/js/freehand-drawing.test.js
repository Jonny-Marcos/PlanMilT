const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

global.window = {};
require('../../js/features/freehand-drawing.js');

function createHarness() {
    const mapEvents = new Map();
    const domEvents = new Map();
    const addedLayers = [];
    const removedLayers = [];
    const createdEvents = [];
    const containerEvents = new Map();
    const container = { style: {}, addEventListener: (name, listener) => containerEvents.set(name, listener) };
    let polyline;

    const map = {
        getContainer: () => container,
        on: (name, listener) => mapEvents.set(name, listener),
        off: name => mapEvents.delete(name),
        addLayer: layer => addedLayers.push(layer),
        removeLayer: layer => removedLayers.push(layer),
        fire: (name, event) => createdEvents.push({ name, event }),
        mouseEventToLatLng: touch => touch.latlng,
        latLngToLayerPoint: latLng => ({
            x: latLng.lng,
            y: latLng.lat,
            distanceTo(other) {
                return Math.hypot(this.x - other.x, this.y - other.y);
            }
        }),
        dragging: { disable() {}, enable() {} },
        doubleClickZoom: { disable() {}, enable() {} }
    };

    const leaflet = {
        Control: {
            extend(definition) {
                return class {
                    onAdd() {
                        return definition.onAdd.call(this, map);
                    }
                };
            }
        },
        DomUtil: {
            create(tagName, className) {
                return { tagName, className, style: {} };
            }
        },
        DomEvent: {
            on(target, name, listener) {
                domEvents.set(name, listener);
            },
            off(target, name) {
                domEvents.delete(name);
            }
        },
        Draw: { Event: { CREATED: 'draw:created' } },
        polyline(points, options) {
            polyline = {
                points: [...points],
                options,
                addLatLng(latLng) { this.points.push(latLng); },
                getLatLngs() { return this.points; }
            };
            return polyline;
        },
        polygon(points, options) {
            return { points, options, type: 'polygon' };
        }
    };

    const control = window.PlanMilT.freehandDrawing.createControl({
        map,
        leaflet,
        getDefaultColor: () => '#123456'
    });
    const button = control.onAdd();

    return { addedLayers, button, createdEvents, container, containerEvents, domEvents, map, mapEvents, polyline: () => polyline, removedLayers };
}

function event(type, lat, lng) {
    return { type, latlng: { lat, lng }, preventDefault() {} };
}

test('button toggles mouse and touch handlers and appearance', () => {
    const harness = createHarness();

    harness.button.onclick();
    assert.equal(harness.container.style.cursor, 'crosshair');
    assert.equal(harness.button.style.backgroundColor, '#bada55');
    assert.deepEqual([...harness.mapEvents.keys()], ['mousedown', 'mouseup', 'mousemove']);
    assert.deepEqual([...harness.domEvents.keys()], ['touchstart', 'touchmove', 'touchend']);

    harness.button.onclick();
    assert.equal(harness.container.style.cursor, '');
    assert.equal(harness.button.style.backgroundColor, 'white');
    assert.equal(harness.mapEvents.size, 0);
    assert.equal(harness.domEvents.size, 0);
});

test('mouse drawing emits a created polyline and returns to inactive mode', async () => {
    const harness = createHarness();
    harness.button.onclick();

    harness.mapEvents.get('mousedown')(event('mousedown', 0, 0));
    harness.mapEvents.get('mousemove')(event('mousemove', 0, 10));
    harness.mapEvents.get('mouseup')(event('mouseup', 0, 20));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(harness.addedLayers[0], harness.polyline());
    assert.equal(harness.createdEvents[0].name, 'draw:created');
    assert.equal(harness.createdEvents[0].event.layerType, 'polyline');
    assert.equal(harness.createdEvents[0].event.layer, harness.polyline());
    assert.equal(harness.button.style.backgroundColor, 'white');
});

test('closed freehand path emits a polygon and removes the temporary line', async () => {
    const harness = createHarness();
    harness.button.onclick();

    harness.mapEvents.get('mousedown')(event('mousedown', 0, 0));
    harness.mapEvents.get('mousemove')(event('mousemove', 0, 10));
    harness.mapEvents.get('mousemove')(event('mousemove', 10, 10));
    harness.mapEvents.get('mouseup')(event('mouseup', 0, 10));
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(harness.removedLayers[0], harness.polyline());
    assert.equal(harness.createdEvents[0].event.layerType, 'polygon');
    assert.equal(harness.createdEvents[0].event.layer.type, 'polygon');
    assert.equal(harness.createdEvents[0].event.layer.options.color, '#123456');
});

function createLineHandler(convertLineToBoundary) {
    const source = fs.readFileSync(path.join(__dirname, '../../js/features/main.js'), 'utf8');
    const handlerSource = source.slice(source.indexOf('map.on(L.Draw.Event.CREATED,'));
    const added = [];
    const alerts = [];
    const errors = [];
    let handler;
    vm.runInNewContext(handlerSource, {
        map: { on(eventName, listener) { handler = listener; } },
        L: { Draw: { Event: { CREATED: 'draw:created' } } },
        tacticalGraphics: { handleCreated: () => false, convertLineToBoundary },
        drawnItems: { addLayer: layer => added.push(layer) },
        Swal: {
            async fire(options) {
                alerts.push(options);
                return options.icon === 'error' ? {} : { value: 'boundary' };
            }
        },
        console: { error: (...args) => errors.push(args) },
        defaultColor: '#123456'
    });
    return { handler, added, alerts, errors };
}

test('freehand and Leaflet polylines offer boundary conversion using the original line', async () => {
    const freehand = createHarness();
    freehand.button.onclick();
    freehand.mapEvents.get('mousedown')(event('mousedown', 0, 0));
    freehand.mapEvents.get('mousemove')(event('mousemove', 0, 10));
    freehand.mapEvents.get('mouseup')(event('mouseup', 0, 20));
    await new Promise(resolve => setTimeout(resolve, 0));

    for (const created of [freehand.createdEvents[0].event, { layerType: 'polyline', layer: {} }]) {
        const converted = [];
        const harness = createLineHandler(async layer => { converted.push(layer); return true; });
        await harness.handler(created);
        assert.equal(harness.alerts[0].inputOptions.boundary, 'Limite');
        assert.equal(converted[0], created.layer);
        assert.equal(harness.added.length, 0);
    }
});

test('cancelling boundary configuration keeps the drawn line', async () => {
    const harness = createLineHandler(async () => false);
    const line = {};
    await harness.handler({ layerType: 'polyline', layer: line });
    assert.deepEqual(harness.added, [line]);
    assert.equal(harness.alerts.length, 1);
});

test('boundary conversion failure reports the error and keeps the drawn line', async () => {
    const harness = createLineHandler(async () => { throw new Error('Conversão indisponível'); });
    const line = {};
    await harness.handler({ layerType: 'polyline', layer: line });
    assert.deepEqual(harness.added, [line]);
    assert.equal(harness.alerts[1].icon, 'error');
    assert.equal(harness.alerts[1].text, 'Conversão indisponível');
    assert.equal(harness.errors.length, 1);
});