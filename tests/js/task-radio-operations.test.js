const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/task-radio-operations.js');

test('radio operation module loads before the task executor', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
    const executorSource = fs.readFileSync(path.join(__dirname, '../../js/features/task-execution.js'), 'utf8');
    assert.ok(html.indexOf('task-radio-operations.js?') < html.indexOf('task-execution.js?'));
    assert.match(executorSource, /title: 'Calculando áreas de cobertura…'/);
    assert.match(executorSource, /Swal\.update\(\{ text: message \}\)/);
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

class LargeLatLngBounds extends LatLngBounds {
    getNorth() { return 0.1; }
    getEast() { return 0.1; }
}

function setup({ layers = [], suggestionLayers = layers, bounds = new LatLngBounds(), distance = () => 1000, analyzeLinks, analyzeCoverageBoundary, compareLinks } = {}) {
    const generated = [];
    const logs = [];
    const analyzedCalls = [];
    const comparedCalls = [];
    const coverageCalls = [];
    const sourceLayer = {
        eachLayer(callback) {
            layers.forEach(callback);
        }
    };
    const planningLayer = {
        eachLayer(callback) {
            suggestionLayers.forEach(callback);
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
        async analyzeLinks(links, presetId, antennaHeight) {
            analyzedCalls.push({ links, presetId, antennaHeight });
            return analyzeLinks ? analyzeLinks(links, presetId, antennaHeight) : links.map(() => ({ isViable: true, rxPower: -70, distTotalKm: 1 }));
        },
        async analyzeCoverageBoundary(center, presetId, maxDistance, antennaHeight, options) {
            coverageCalls.push({ center, presetId, maxDistance, antennaHeight, options });
            if (analyzeCoverageBoundary) {
                return analyzeCoverageBoundary(center, presetId, maxDistance, antennaHeight, options);
            }
            return Array.from({ length: 36 }, (_, index) => {
                const bearing = index * Math.PI / 18;
                return {
                    lat: center.lat + Math.sin(bearing) * 0.01,
                    lng: center.lng + Math.cos(bearing) * 0.01
                };
            });
        },
        async compareLinks(links, antennaHeight) {
            comparedCalls.push({ links, antennaHeight });
            return compareLinks ? compareLinks(links, antennaHeight) : {
                optical: links.map(() => ({ isViable: true, rxPower: 0, distTotalKm: 1 })),
                radio: links.map(() => ({ isViable: false, rxPower: -120, distTotalKm: 1 }))
            };
        }
    };
    const task = window.PlanMilT.taskRadioOperations.attach({
        map: {
            getBounds: () => bounds,
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
            icon(options) {
                return { options };
            },
            marker(position, options) {
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

    return { task, generated, logs, analyzedCalls, comparedCalls, coverageCalls };
}

test('coverage-gap task estimates and draws covered and uncovered grid cells', async () => {
    const layers = [new Marker('station', { lat: 0, lng: 0 })];
    const { task, generated, logs, analyzedCalls } = setup({
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
        antennaHeight: 12,
        area: null
    });

    assert.equal(result.cellCount, 4);
    assert.equal(result.gapCount, 2);
    assert.equal(generated.length, 4);
    assert.ok(generated.some(layer => layer.feature.properties.name === 'Lacuna de cobertura estimada'));
    assert.match(logs[0], /2 lacunas identificadas/);
    assert.equal(analyzedCalls[0].antennaHeight, 12);
});

test('route task marks samples with and without viable station links', async () => {
    const route = new Polyline([{ lat: 0, lng: 0 }, { lat: 0, lng: 0.02 }]);
    const layers = [
        new Marker('station', { lat: 0, lng: 0 }),
        route
    ];
    const { task, generated, analyzedCalls } = setup({
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
        antennaHeight: 8,
        area: null
    });

    assert.deepEqual(result, { sampleCount: 3, uncoveredCount: 2 });
    assert.equal(generated.length, 3);
    assert.ok(generated.some(layer => layer.feature.properties.name === 'Falha de comunicação estimada'));
    assert.equal(analyzedCalls[0].antennaHeight, 8);
});

test('repeater task calculates each unit coverage and recommends sites inside their intersections', async () => {
    const drawingMarkers = [new Marker('group-a', { lat: 0, lng: 0.005 })];
    const planningMarkers = [new Marker('group-b', { lat: 0, lng: 0.015 })];
    const { task, generated, analyzedCalls, coverageCalls, logs } = setup({
        layers: drawingMarkers,
        suggestionLayers: planningMarkers
    });
    const progress = [];
    const result = await task.suggestRepeaterPositions({
        iconTypesToCover: ['group-a', 'group-b'],
        repeaterIcon: 'symbols/friend/repeater.svg',
        radioPreset: 'radio',
        maxDistance: 20,
        antennaHeight: 15,
        area: null
    }, message => progress.push(message));

    assert.ok(result.length > 0);
    assert.equal(result[0].coverageByIcon.every(count => count > 0), true);
    assert.equal(result[0].connectedUnitCount, 2);
    assert.equal(generated.length, result.length);
    assert.equal(generated[0].options.icon.options.iconUrl, 'symbols/friend/repeater.svg');
    assert.equal(generated[0].feature.properties.name, 'Posição recomendada para repetidor');
    assert.equal(generated[0].feature.properties.iconUrl, 'symbols/friend/repeater.svg');
    assert.match(generated[0].popup, /Interseção de 2 áreas de cobertura/);
    assert.equal(coverageCalls.length, 2);
    assert.equal(coverageCalls[0].antennaHeight, 15);
    assert.equal(coverageCalls[0].options.radialCount, 72);
    assert.ok(coverageCalls[0].options.resolutionKm >= 0.05);
    assert.ok(
        72 * (Math.ceil(20 / coverageCalls[0].options.resolutionKm) + 1) <= 25000
    );
    assert.match(progress[0], /resolução aproximada/);
    assert.ok(analyzedCalls.length > 0);
    assert.match(progress[0], /Calculando área de cobertura 1 de 2/);
    assert.match(progress.at(-1), /Validando os locais de interseção/);
    assert.match(logs.at(-1), /nas interseções das áreas de cobertura/);
});

test('repeater task supports saved sequences with the former candidate icon parameter', async () => {
    const layers = [
        new Marker('group-a', { lat: 0, lng: 0.005 }),
        new Marker('group-b', { lat: 0, lng: 0.015 })
    ];
    const { task, generated, coverageCalls } = setup({ layers });
    await task.suggestRepeaterPositions({
        candidateIcon: 'symbols/friend/legacy-repeater.svg',
        iconType1: 'group-a',
        iconType2: 'group-b',
        radioPreset: 'radio',
        maxDistance: 20,
        area: null
    });

    assert.equal(generated[0].options.icon.options.iconUrl, 'symbols/friend/legacy-repeater.svg');
    assert.equal(coverageCalls.length, 2);
});

test('repeater task respects the configured maximum number of recommendations', async () => {
    const layers = [
        new Marker('group-a', { lat: 0, lng: 0.005 }),
        new Marker('group-b', { lat: 0, lng: 0.015 })
    ];
    const { task, generated, logs } = setup({ layers, suggestionLayers: [] });
    const recommendations = await task.suggestRepeaterPositions({
        repeaterIcon: 'symbols/friend/repeater.svg',
        iconTypesToCover: ['group-a', 'group-b'],
        radioPreset: 'radio',
        maxDistance: 20,
        maxRepeaters: 1,
        minimumRepeaterDistanceKm: 0,
        area: null
    });

    assert.equal(recommendations.length, 1);
    assert.equal(generated.length, recommendations.length);
    assert.match(logs.at(-1), /nas interseções das áreas de cobertura/);
});

test('repeater task enforces the configured minimum distance between recommendations', async () => {
    const layers = [
        new Marker('group-a', { lat: 0, lng: 0.005 }),
        new Marker('group-b', { lat: 0, lng: 0.015 })
    ];
    const distance = (first, second) =>
        Math.hypot((first.lat - second.lat) * 111320, (first.lng - second.lng) * 111320);
    const { task, generated } = setup({ layers, suggestionLayers: [], distance });
    const recommendations = await task.suggestRepeaterPositions({
        repeaterIcon: 'symbols/friend/repeater.svg',
        iconTypesToCover: ['group-a', 'group-b'],
        radioPreset: 'radio',
        maxDistance: 20,
        maxRepeaters: 10,
        minimumRepeaterDistanceKm: 50,
        area: null
    });

    assert.equal(recommendations.length, 1);
    assert.equal(generated.length, 1);
});

test('repeater task preserves the former ten-position and 500-meter defaults', async () => {
    const layers = [
        new Marker('group-a', { lat: 0, lng: 0.005 }),
        new Marker('group-b', { lat: 0, lng: 0.015 })
    ];
    const distance = (first, second) =>
        Math.hypot((first.lat - second.lat) * 111320, (first.lng - second.lng) * 111320);
    const { task, generated } = setup({ layers, suggestionLayers: [], distance });
    const recommendations = await task.suggestRepeaterPositions({
        repeaterIcon: 'symbols/friend/repeater.svg',
        iconTypesToCover: ['group-a', 'group-b'],
        radioPreset: 'radio',
        maxDistance: 20,
        area: null
    });

    assert.ok(recommendations.length > 0 && recommendations.length <= 10);
    assert.equal(generated.length, recommendations.length);
    for (let index = 0; index < recommendations.length; index++) {
        for (let otherIndex = index + 1; otherIndex < recommendations.length; otherIndex++) {
            assert.ok(
                distance(recommendations[index].position, recommendations[otherIndex].position) >= 500
            );
        }
    }
});

test('repeater task reports when selected unit coverage areas do not intersect', async () => {
    const layers = [
        new Marker('group-a', { lat: 0, lng: 0 }),
        new Marker('group-a', { lat: 0, lng: 0.1 })
    ];
    const { task } = setup({
        layers,
        analyzeCoverageBoundary(center) {
            return Array.from({ length: 36 }, (_, index) => {
                const bearing = index * Math.PI / 18;
                return {
                    lat: center.lat + Math.sin(bearing) * 0.001,
                    lng: center.lng + Math.cos(bearing) * 0.001
                };
            });
        }
    });

    await assert.rejects(
        task.suggestRepeaterPositions({
            iconTypesToCover: ['group-a'],
            repeaterIcon: 'symbols/friend/repeater.svg',
            radioPreset: 'radio',
            maxDistance: 20,
            area: null
        }),
        /não têm interseções/
    );
});

test('preset comparison reports per-radio viability and draws the tested pair', async () => {
    const layers = [
        new Marker('unit-a', { lat: 0, lng: 0 }),
        new Marker('unit-b', { lat: 0, lng: 0.01 })
    ];
    const { task, generated, comparedCalls } = setup({ layers });
    const result = await task.compareRadioPresets({
        iconLayer: 'drawnItems',
        iconType1: 'unit-a',
        iconType2: 'unit-b',
        maxDistance: 20,
        antennaHeight: 10,
        area: null
    });

    assert.equal(result.pairCount, 1);
    assert.equal(result.summary.optical.viableCount, 1);
    assert.equal(result.summary.radio.viableCount, 0);
    assert.equal(generated.length, 1);
    assert.match(generated[0].popup, /Rádio: falho/);
    assert.equal(comparedCalls[0].antennaHeight, 10);
});

test('radio task failures explain which map input is missing', async () => {
    const { task } = setup();

    await assert.rejects(
        task.checkRouteCommunication({
            iconLayer: 'drawnItems',
            stationIcon: 'station',
            radioPreset: 'radio',
            maxDistance: 20,
            sampleInterval: 1,
            area: null
        }),
        /Nenhuma estação do tipo selecionado.*Adicione esse marcador/
    );

    await assert.rejects(
        task.suggestRepeaterPositions({
            repeaterIcon: 'symbols/friend/repeater.svg',
            iconTypesToCover: ['group-a', 'group-b'],
            radioPreset: 'radio',
            maxDistance: 20,
            area: null
        }),
        /Não foram encontrados marcadores dos tipos selecionados na área visível: group-a, group-b/
    );

    await assert.rejects(
        task.compareRadioPresets({
            iconLayer: 'drawnItems',
            iconType1: 'unit-a',
            iconType2: 'unit-b',
            maxDistance: 20,
            area: null
        }),
        /Nenhum ícone do grupo de origem e destino.*área visível/
    );
});
