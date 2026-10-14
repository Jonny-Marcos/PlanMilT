const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};

const buttonListeners = new Map();
const mapListeners = new Map();
const temporaryLayer = {
    addTo(map) {
        this.map = map;
        return this;
    },
    clearLayers() {}
};

global.document = {
    getElementById(id) {
        return {
            style: {},
            addEventListener(eventName, listener) {
                buttonListeners.set(`${id}:${eventName}`, listener);
            }
        };
    }
};

require('../../js/features/radio-planning.js');

test('radio planning attaches the UI/map listeners and keeps generated layers private', () => {
    const map = {
        on(eventName, listener) {
            mapListeners.set(eventName, listener);
        }
    };
    const leaflet = {
        layerGroup: () => temporaryLayer
    };

    window.PlanMilT.radioPlanning.attach({
        map,
        leaflet,
        turf: {},
        drawnItems: {},
        sweetAlert: {},
        chartConstructor: class {}
    });

    assert.equal(temporaryLayer.map, map);
    assert.equal(mapListeners.has('click'), true);
    assert.equal(buttonListeners.has('linkPredictionBtn:click'), true);
    assert.equal(window.rfGeneratedLayers, undefined);
});