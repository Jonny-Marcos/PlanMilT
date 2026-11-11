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
        },
        destination(center, distance, bearing) {
            const radians = bearing * Math.PI / 180;
            const latitude = center[1] + distance * Math.cos(radians) / 111;
            const longitude = center[0] + distance * Math.sin(radians) / 111;
            return { geometry: { coordinates: [longitude, latitude] } };
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

    await test('manual coverage reports real radial progress and an estimate before rendering', async () => {
        const listeners = new Map();
        const elements = new Map();
        const progressValues = [];
        const messages = [];
        const requestUrls = [];
        let finish;
        const finished = new Promise(resolve => { finish = resolve; });
        const originalDocument = global.document;
        const originalClient = window.PlanMilT.apiClient;
        global.document = {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, {
                    style: {},
                    addEventListener(name, callback) { listeners.set(`${id}:${name}`, callback); }
                });
                return elements.get(id);
            }
        };
        const makeText = () => ({
            set textContent(value) { messages.push(value); },
            get textContent() { return messages.at(-1); }
        });
        const map = {
            on(name, callback) { listeners.set(`map:${name}`, callback); },
            getContainer: () => ({ style: {} })
        };
        const marker = {
            addTo() { return this; },
            bindPopup() { return this; }
        };
        const leaflet = {
            layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
            marker: () => marker,
            divIcon: () => ({}),
            geoJSON: () => ({ addTo() { return this; } })
        };
        const turf = {
            destination(center, distance, angle) {
                return { geometry: { coordinates: [center[0] + distance, center[1] + angle / 1000] } };
            },
            polygon: (geometry, properties) => ({ geometry, properties }),
            featureCollection: features => ({ features })
        };
        const Swal = {
            fire(options) {
                if (options.title && options.title.includes('Predição de Alcance')) {
                    return Promise.resolve({ value: {
                        mode: 'coverage', radius: 0.1, freq: 0, isOptical: true,
                        txHeight: 1.5, rxHeight: 1.5
                    } });
                }
                if (options.title === 'Predição de área de cobertura') {
                    elements.set('coverageProgressMessage', makeText());
                    elements.set('coverageProgressEstimate', makeText());
                    elements.set('coverageProgress', { set value(value) { progressValues.push(value); } });
                    options.didOpen();
                }
                if (options.title === 'Arquivos de Elevação Faltando') return Promise.resolve({ isConfirmed: true });
                if (options.title === 'Upload de Arquivos de Elevação') return Promise.resolve({ value: {} });
                return Promise.resolve({});
            },
            close() { finish(); }
        };
        window.PlanMilT.apiClient = {
            async request(url, options) {
                requestUrls.push(url);
                if (url === 'elevation-upload.php') {
                    return { ok: true, async json() { return { success: true }; } };
                }
                if (requestUrls.length === 1) {
                    return { ok: false, async json() { return { error: 'Arquivos de elevação faltando', missingTiles: ['S22W052.HGT'] }; } };
                }
                return {
                    ok: true,
                    async json() {
                        return JSON.parse(options.body).points.map(() => ({ elevation: 100 }));
                    }
                };
            }
        };
        try {
            window.PlanMilT.radioPlanning.attach({
                map, leaflet, turf, drawnItems: {}, sweetAlert: Swal, chartConstructor: class {}
            });
            await listeners.get('linkPredictionBtn:click').call({ style: {} });
            listeners.get('map:click')({ latlng: { lat: 0, lng: 0 } });
            let timeout;
            try {
                await Promise.race([
                    finished,
                    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Predição não terminou')), 3000); })
                ]);
            } finally {
                clearTimeout(timeout);
            }
            assert.deepEqual(progressValues, Array.from({ length: 73 }, (_, index) => index));
            assert.ok(messages.some(message => /tempo restante indisponível/.test(message)));
            assert.ok(messages.some(message => /Consultando novamente/.test(message)));
            assert.ok(messages.some(message => /Analisando radiais: 72 de 72 \(100%\)/.test(message)));
            assert.ok(messages.some(message => /Tempo estimado para as radiais/.test(message)));
            assert.ok(messages.some(message => /Preparando a exibição/.test(message)));
            assert.deepEqual(requestUrls, ['elevation-profile.php', 'elevation-upload.php', 'elevation-profile.php']);
        } finally {
            global.document = originalDocument;
            window.PlanMilT.apiClient = originalClient;
        }
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

    const coverageBoundary = await radioPlanning.analyzeCoverageBoundary(
        { lat: 0, lng: 0 },
        'optical',
        0.2,
        1.5,
        { radialCount: 8, resolutionKm: 0.1 }
    );
    assert.equal(coverageBoundary.length, 8);
    assert.ok(coverageBoundary.every(point => Number.isFinite(point.lat) && Number.isFinite(point.lng)));
    assert.equal(requests.length, 6);
});