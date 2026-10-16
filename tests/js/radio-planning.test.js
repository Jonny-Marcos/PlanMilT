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

test('radio planning exposes shared presets and reusable point-to-point analysis', async () => {
    const map = {
        on() {}
    };
    const leaflet = {
        layerGroup: () => temporaryLayer
    };
    const requests = [];
    let elevations = [100, 100, 100];
    window.PlanMilT.apiClient = {
        async request(url, options) {
            requests.push({ url, options });
            return {
                ok: true,
                async json() {
                    const pointCount = JSON.parse(options.body).points.length;
                    return Array.from({ length: pointCount }, (_, index) => ({
                        elevation: elevations[index % elevations.length]
                    }));
                }
            };
        }
    };
    const turf = {
        lineString: coordinates => ({ coordinates }),
        length: () => 0.06,
        along(line, distance) {
            return { geometry: { coordinates: [distance, 0] } };
        }
    };

    const radioPlanning = window.PlanMilT.radioPlanning.attach({
        map,
        leaflet,
        turf,
        drawnItems: {},
        sweetAlert: {},
        chartConstructor: class {}
    });

    await assert.rejects(
        radioPlanning.analyzeLink(
            { lat: 0, lng: 0 },
            { lat: 0, lng: 0.06 },
            'optical',
            -1
        ),
        /altura da antena.*igual ou maior que zero/
    );

    assert.deepEqual(radioPlanning.getPresets().map(preset => preset.id), [
        'optical',
        'harris_hh',
        'harris_v51x',
        'apx2000',
        'gtr8000',
        'airgrid_m5'
    ]);
    const result = await radioPlanning.analyzeLink(
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.06 },
        'optical'
    );

    assert.equal(result.isViable, true);
    assert.equal(result.hasObstruction, false);
    assert.equal(result.distTotalKm, 0.06);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'elevation-profile.php');
    assert.equal(JSON.parse(requests[0].options.body).points.length, 3);

    elevations = [100, 120, 100];
    const radioResult = await radioPlanning.analyzeLink(
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.06 },
        'harris_hh'
    );
    assert.equal(radioResult.hasObstruction, true);
    assert.equal(radioResult.isViable, true);
    assert.ok(Number.isFinite(radioResult.rxPower));
    assert.equal(requests.length, 2);

    const elevatedAntennaResult = await radioPlanning.analyzeLink(
        { lat: 0, lng: 0 },
        { lat: 0, lng: 0.06 },
        'optical',
        30
    );
    assert.equal(elevatedAntennaResult.hasObstruction, false);
    assert.equal(elevatedAntennaResult.isViable, true);
    assert.equal(requests.length, 3);

    const batchResults = await radioPlanning.analyzeLinks([
        { from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0.06 } },
        { from: { lat: 0, lng: 0.01 }, to: { lat: 0, lng: 0.07 } }
    ], 'optical', 8);
    assert.equal(batchResults.length, 2);
    assert.equal(requests.length, 4);

    const comparison = await radioPlanning.compareLinks([
        { from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0.06 } }
    ], 8);
    assert.equal(Object.keys(comparison).length, 6);
    assert.equal(comparison.optical.length, 1);
    assert.equal(requests.length, 5);
});