const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('../../js/features/coverage-propagation.js');
require('../../js/features/coverage-image.js');

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

test('manual coverage form offers the three scenarios and validates supported frequencies', async () => {
    const listeners = new Map();
    const fields = {
        rfMode: { value: 'coverage' },
        rfPreset: { value: 'custom' },
        rfFreq: { value: '450' },
        rfTxPower: { value: '37' },
        rfTxGain: { value: '2' },
        rfTxHeight: { value: '1.5' },
        rfRxGain: { value: '2' },
        rfRxHeight: { value: '1.5' },
        rfRxSens: { value: '-105' },
        rfRadius: { value: '5' },
        rfPenetration: { value: 'low' },
        rfPenetrationField: { style: {} },
        rfSpecificOptions: { style: {} },
        colRadius: { style: {} },
        wattsDisplay: {},
        btnClearRFLayers: {}
    };
    for (const field of Object.values(fields)) {
        field.addEventListener = (name, callback) => { field[name] = callback; };
    }
    const originalDocument = global.document;
    let form;
    let warning;
    global.document = {
        getElementById(id) {
            return fields[id] || { addEventListener(name, callback) { listeners.set(name, callback); } };
        }
    };
    try {
        window.PlanMilT.radioPlanning.attach({
            map: { on() {} },
            leaflet: { layerGroup: () => temporaryLayer },
            turf: {}, drawnItems: {},
            sweetAlert: {
                fire(options) { form = options; return Promise.resolve({}); },
                showValidationMessage(message) { warning = message; }
            },
            chartConstructor: class {}
        });
        await listeners.get('click').call({ style: {} });
        assert.match(form.html, /Alta \(Otimista\)/);
        assert.match(form.html, /Média \(Equilibrada\)/);
        assert.match(form.html, /Baixa \(Pessimista\)/);
        form.didOpen();
        assert.equal(fields.rfPenetrationField.style.display, 'block');
        fields.rfMode.value = 'ptp';
        fields.rfMode.change({ target: fields.rfMode });
        assert.equal(fields.rfPenetrationField.style.display, 'none');
        fields.rfMode.value = 'coverage';
        fields.rfPreset.value = 'optical';
        fields.rfPreset.change({ target: fields.rfPreset });
        assert.equal(fields.rfPenetrationField.style.display, 'none');
        fields.rfPreset.value = 'custom';
        fields.rfPreset.change({ target: fields.rfPreset });
        assert.equal(fields.rfPenetrationField.style.display, 'block');
        assert.equal(form.preConfirm().penetration, 'low');
        fields.rfFreq.value = '2';
        assert.equal(form.preConfirm(), false);
        assert.match(warning, /frequência/);
        fields.rfFreq.value = '450';
        fields.rfTxPower.value = '';
        assert.equal(form.preConfirm(), false);
        assert.match(warning, /parâmetros RF/);
        fields.rfPreset.value = 'optical';
        assert.equal(form.preConfirm().isOptical, true);
    } finally {
        global.document = originalDocument;
    }
});

test('coverage boundary changes with scenario for an obstructed SHF terrain profile', async () => {
    const previousClient = window.PlanMilT.apiClient;
    window.PlanMilT.apiClient = {
        async request(url, options) {
            const points = JSON.parse(options.body).points;
            return { ok: true, async json() {
                return points.map((_, index) => ({ elevation: index % 11 === 3 ? 120 : 100 }));
            } };
        }
    };
    try {
        const radio = window.PlanMilT.radioPlanning.attach({
            map: { on() {} },
            leaflet: { layerGroup: () => temporaryLayer },
            turf: { destination: (center, distance) => ({ geometry: { coordinates: [center[0] + distance, center[1]] } }) },
            drawnItems: {}, sweetAlert: {}, chartConstructor: class {}
        });
        const boundaries = [];
        for (const penetration of ['high', 'medium', 'low']) {
            const ring = await radio.analyzeCoverageBoundary(
                { lat: 0, lng: 0 }, 'airgrid_m5', 10, 1.5,
                { radialCount: 8, resolutionKm: 1, penetration }
            );
            boundaries.push(ring[0].lng);
        }
        assert.deepEqual(boundaries, [10, 8, 3]);
    } finally {
        window.PlanMilT.apiClient = previousClient;
    }
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
        let requestedPoints;
        const renderedCells = [];
        const removedLayers = [];
        let savedImage;
        let finish;
        const finished = new Promise(resolve => { finish = resolve; });
        const originalDocument = global.document;
        const originalClient = window.PlanMilT.apiClient;
        const originalElevationFiles = window.PlanMilT.elevationFiles;
        window.PlanMilT.elevationFiles = { async ensure() {
            const response = await window.PlanMilT.apiClient.request('elevation-upload.php');
            return (await response.json()).success;
        } };
        const originalCoverage = window.PlanMilT.coverageImage;
        window.PlanMilT.coverageImage = {
            resolution: originalCoverage.resolution,
            createRaster: () => ({
                draw(points, color, opacity) { renderedCells.push({ points, color, opacity }); },
                finish: () => ({ image: 'data:image/png;base64,AA==', mapImage: 'data:image/png;base64,AA==', bounds: [[-1, -1], [1, 1]] })
            }),
            add(feature) { savedImage = feature; return {}; },
            remove(layer) { removedLayers.push(layer); }
        };
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
            getContainer: () => ({ style: {} }),
            hasLayer: () => false
        };
        const marker = {
            addTo() { return this; },
            bindPopup() { return this; }
        };
        const leaflet = {
            layerGroup: () => ({ addTo() { return this; }, clearLayers() {} }),
            marker: () => marker,
            divIcon: () => ({}),
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
                    options.didOpen();
                    return Promise.resolve({ value: {
                        mode: 'coverage', radius: 100, freq: 0, isOptical: true,
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
                        requestedPoints = JSON.parse(options.body).points;
                        return requestedPoints.map(() => ({ elevation: 100 }));
                    }
                };
            }
        };
        try {
            window.PlanMilT.radioPlanning.attach({
                map, leaflet, turf, drawnItems: { hasLayer: () => false }, sweetAlert: Swal, chartConstructor: class {}
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
            assert.equal(requestedPoints.length, 14472);
            assert.ok(requestedPoints.every(point => point.longitude <= 100));
            assert.ok(requestedPoints.every(point => Object.keys(point).length === 2));
            assert.ok(renderedCells.length > 0);
            assert.equal(renderedCells[0].color, '#ffff00');
            assert.equal(renderedCells[0].opacity, 0.45);
            assert.equal(savedImage.geometry, null);
            assert.equal(savedImage.properties.coverageImage.mode, 'optical');
            listeners.get('btnClearRFLayers:click')();
            listeners.get('btnClearRFLayers:click')();
            assert.equal(removedLayers.length, 2);
        } finally {
            global.document = originalDocument;
            window.PlanMilT.apiClient = originalClient;
            window.PlanMilT.elevationFiles = originalElevationFiles;
            window.PlanMilT.coverageImage = originalCoverage;
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

    elevations = [100, 120, 100];
    const high = await radioPlanning.analyzeLinks([
        { from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0.06 } }
    ], 'harris_hh', 1.5, { penetration: 'high' });
    const low = await radioPlanning.analyzeLinks([
        { from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0.06 } }
    ], 'harris_hh', 1.5, { penetration: 'low' });
    assert.ok(high[0].rxPower > low[0].rxPower);
    assert.equal(high[0].band, 'VHF');
    await assert.rejects(radioPlanning.analyzeCoverageBoundary(
        { lat: 0, lng: 0 }, 'harris_hh', 0.2, 1.5,
        { radialCount: 8, resolutionKm: 0.1, penetration: 'invalid' }
    ), /condição válida/);
});