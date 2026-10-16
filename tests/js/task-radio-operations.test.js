const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/task-radio-operations.js');

test('radio operation module loads before the task executor', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
    assert.ok(html.indexOf('task-radio-operations.js?') < html.indexOf('task-execution.js?'));
});

class Marker {
    constructor(iconUrl, position) {
        this.options = { icon: { options: { iconUrl } } };
        this.position = position;
    }

    getLatLng() {
        return this.position;
    }
}

class Polyline {
    constructor(positions) {
        this.positions = positions;
    }

    getLatLngs() {
        return this.positions;
    }
}

class Polygon {}

class LatLngBounds {
    getNorth() { return 0.02; }
    getSouth() { return 0; }
    getEast() { return 0.02; }
    getWest() { return 0; }
    contains() { return true; }
}

function setup({ layers = [], distance = () => 1000, analyzeLinks, compareLinks } = {}) {
    const generated = [];
    const logs = [];
    const sourceLayer = {
        eachLayer(callback) {
            layers.forEach(callback);
        }
    };
    const planningLayer = {
        eachLayer(callback) {
            layers.forEach(callback);
        },
        addLayer(layer) {
            generated.push(layer);
        }
    };
    const radioPlanning = {
        getPresets: () => [
            { id: 'optical', label: 'Ótico' },
            { id: 'radio', label: 'Rádio' }
        ],
        async analyzeLinks(links, presetId) {
            return analyzeLinks ? analyzeLinks(links, presetId) : links.map(() => ({ isViable: true, rxPower: -70, distTotalKm: 1 }));
        },
        async compareLinks(links) {
            return compareLinks ? compareLinks(links) : {
                optical: links.map(() => ({ isViable: true, rxPower: 0, distTotalKm: 1 })),
                radio: links.map(() => ({ isViable: false, rxPower: -120, distTotalKm: 1 }))
            };
        }
    };
    const task = window.PlanMilT.taskRadioOperations.attach({
        map: {
            getBounds: () => new LatLngBounds(),
            distance
        },
        leaflet: {
            Marker,
            Polyline,
            Polygon,
            LatLngBounds,
            circleMarker(position, options) {
                return {
                    position,
                    options,
                    addTo(layer) {
                        layer.addLayer(this);
                        return this;
                    },
                    bindPopup(html) {
                        this.popup = html;
                    }
                };
            },
            polygon(positions, options) {
                return {
                    positions,
                    options,
                    addTo(layer) {
                        layer.addLayer(this);
                        return this;
                    },
                    bindPopup(html) {
                        this.popup = html;
                    }
                };
            },
            polyline(positions, options) {
                return {
                    positions,
                    options,
                    addTo(layer) {
                        layer.addLayer(this);
                        return this;
                    },
                    bindPopup(html) {
                        this.popup = html;
                    }
                };
            }
        },
        turf: {
            lineString: coordinates => ({ coordinates }),
            length: () => 2,
            along(line, distance) {
                return { geometry: { coordinates: [distance / 10, 0] } };
            },
            point: coordinates => ({ geometry: { coordinates } }),
            booleanPointInPolygon: () => true
        },
        drawnItems: sourceLayer,
        planningLayer,
        radioPlanning,
        log: message => logs.push(message)
    });

    return { task, generated, logs };
}

test('coverage-gap task estimates and draws covered and uncovered grid cells', async () => {
    const layers = [new Marker('station', { lat: 0, lng: 0 })];
    const { task, generated, logs } = setup({
        layers,
        analyzeLinks: links => links.map((link, index) => ({
            isViable: index % 2 === 0,
            rxPower: -80,
            distTotalKm: 1
        }))
    });
    const result = await task.identifyCoverageGaps({
        iconLayer: 'drawnItems',
        stationIcon: 'station',
        radioPreset: 'radio',
        cellSizeKm: 2,
        maxDistance: 20,
        area: null
    });

    assert.equal(result.cellCount, 4);
    assert.equal(result.gapCount, 2);
    assert.equal(generated.length, 4);
    assert.ok(generated.some(layer => layer.feature.properties.name === 'Lacuna de cobertura estimada'));
    assert.match(logs[0], /2 lacunas identificadas/);
});

test('route task marks samples with and without viable station links', async () => {
    const route = new Polyline([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.02 }]);
    const layers = [
        new Marker('station', { lat: 0, lng: 0 }),
        route
    ];
    const { task, generated } = setup({
        layers,
        analyzeLinks: links => links.map((link, index) => ({
            isViable: index === 0,
            rxPower: -95,
            distTotalKm: 1
        }))
    });
    const result = await task.checkRouteCommunication({
        iconLayer: 'drawnItems',
        stationIcon: 'station',
        radioPreset: 'radio',
        maxDistance: 20,
        sampleInterval: 1,
        area: null
    });

    assert.deepEqual(result, { sampleCount: 3, uncoveredCount: 2 });
    assert.equal(generated.length, 3);
    assert.ok(generated.some(layer => layer.feature.properties.name === 'Falha de comunicação estimada'));
});

test('repeater task recommends candidate sites that connect both groups', async () => {
    const layers = [
        new Marker('candidate', { lat: 0, lng: 0 }),
        new Marker('group-a', { lat: 0, lng: 0.01 }),
        new Marker('group-b', { lat: 0, lng: 0.02 })
    ];
    const { task, generated } = setup({ layers });
    const result = await task.suggestRepeaterPositions({
        iconLayer: 'drawnItems',
        candidateIcon: 'candidate',
        iconType1: 'group-a',
        iconType2: 'group-b',
        radioPreset: 'radio',
        maxDistance: 20,
        area: null
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].firstCount, 1);
    assert.equal(result[0].secondCount, 1);
    assert.equal(generated[0].feature.properties.name, 'Posição recomendada para repetidor');
});

test('preset comparison reports per-radio viability and draws the tested pair', async () => {
    const layers = [
        new Marker('unit-a', { lat: 0, lng: 0 }),
        new Marker('unit-b', { lat: 0, lng: 0.01 })
    ];
    const { task, generated } = setup({ layers });
    const result = await task.compareRadioPresets({
        iconLayer: 'drawnItems',
        iconType1: 'unit-a',
        iconType2: 'unit-b',
        maxDistance: 20,
        area: null
    });

    assert.equal(result.pairCount, 1);
    assert.equal(result.summary.optical.viableCount, 1);
    assert.equal(result.summary.radio.viableCount, 0);
    assert.equal(generated.length, 1);
    assert.match(generated[0].popup, /Rádio: falho/);
});
