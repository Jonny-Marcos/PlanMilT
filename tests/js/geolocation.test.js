const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/geolocation.js');

function createGeolocationHarness() {
    const listeners = new Map();
    const buttonListeners = new Map();
    const removedLayers = [];
    const mapCalls = { locate: [], stopLocate: 0 };
    const errors = [];
    let markerCount = 0;

    const map = {
        on(eventName, listener) {
            listeners.set(eventName, listener);
        },
        off(eventName) {
            listeners.delete(eventName);
        },
        locate(options) {
            mapCalls.locate.push(options);
        },
        stopLocate() {
            mapCalls.stopLocate++;
        },
        removeLayer(layer) {
            removedLayers.push(layer);
        }
    };

    const button = {
        addEventListener(eventName, listener) {
            buttonListeners.set(eventName, listener);
        },
        removeEventListener(eventName) {
            buttonListeners.delete(eventName);
        },
        click() {
            buttonListeners.get('click')();
        }
    };

    const leaflet = {
        marker(latlng) {
            return {
                id: ++markerCount,
                latlng,
                addTo(targetMap) {
                    assert.equal(targetMap, map);
                    return this;
                }
            };
        }
    };

    const controller = window.PlanMilT.geolocation.attach({
        map,
        button,
        leaflet,
        showError: message => errors.push(message)
    });

    return { button, buttonListeners, controller, errors, listeners, mapCalls, removedLayers };
}

test('button starts tracking and creates a marker for each location update', () => {
    const harness = createGeolocationHarness();

    harness.button.click();
    assert.deepEqual(harness.mapCalls.locate, [{
        setView: true,
        maxZoom: 16,
        watch: true,
        enableHighAccuracy: true
    }]);

    const onLocationFound = harness.listeners.get('locationfound');
    onLocationFound({ latlng: { lat: 1, lng: 2 } });
    onLocationFound({ latlng: { lat: 3, lng: 4 } });

    assert.deepEqual(harness.removedLayers.map(layer => layer.id), [1]);
});

test('button stops tracking and removes the current marker', () => {
    const harness = createGeolocationHarness();

    harness.button.click();
    harness.listeners.get('locationfound')({ latlng: { lat: 1, lng: 2 } });
    harness.button.click();

    assert.equal(harness.mapCalls.stopLocate, 1);
    assert.deepEqual([...harness.listeners.keys()], []);
    assert.deepEqual(harness.removedLayers.map(layer => layer.id), [1]);
});

test('location errors are sent to the injected error handler', () => {
    const harness = createGeolocationHarness();

    harness.button.click();
    harness.listeners.get('locationerror')({ message: 'permission denied' });

    assert.deepEqual(harness.errors, ['Erro ao obter a localização: permission denied']);
});

test('controller stop detaches the button listener', () => {
    const harness = createGeolocationHarness();

    harness.controller.stop();

    assert.equal(harness.buttonListeners.has('click'), false);
});