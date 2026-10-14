const assert = require('node:assert/strict');
const test = require('node:test');

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