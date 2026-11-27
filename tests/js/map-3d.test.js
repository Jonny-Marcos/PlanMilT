const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/map-3d.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '../../js/features/main.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(__dirname, '../../css/app.css'), 'utf8');
const viewerSource = fs.readFileSync(path.join(__dirname, '../../js/features/map-3d-viewer.js'), 'utf8');
const viewerHtml = fs.readFileSync(path.join(__dirname, '../../visualizador-3d.html'), 'utf8');
const offlineManagerSource = fs.readFileSync(path.join(__dirname, '../../js/features/offline-manager.js'), 'utf8');

function setup({ terrainResults = [{ elevations: [[100, 110], [100, 110]], missingTiles: [] }], ensure, isOnline = true } = {}) {
    const listeners = new Map();
    const requests = [];
    const messages = [];
    let click;
    const viewer = { postMessage(message, origin) { messages.push({ message, origin }); } };
    const button = { addEventListener(name, callback) { click = callback; }, focus() { this.focused = true; } };
    const overlay = { hidden: true };
    let frameSource = '';
    const frame = {
        contentWindow: viewer,
        contentDocument: null,
        navigationCount: 0,
        get src() { return frameSource; },
        set src(value) { frameSource = value; this.navigationCount++; },
        getAttribute(name) { return name === 'src' ? frameSource : null; },
        focus() { this.focused = true; }
    };
    const classes = new Set();
    const downloads = [];
    const textures = [];
    const textureOptions = [];
    const textureZooms = [];
    const terrainLookups = [];
    const context = {
        URL, AbortController,
        document: {
            body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
            getElementById(id) {
                return { view3DButton: button, map3DOverlay: overlay, map3DFrame: frame }[id];
            }
        },
        drawnItems: {},
        layerRegistry: {},
        map: {
            getZoom: () => 12,
            getBounds: () => ({
                getSouth: () => -21.7,
                getWest: () => -51.4,
                getNorth: () => -21.4,
                getEast: () => -51.1
            })
        },
        Swal: { fire: async () => ({}) },
        window: {
            location: { origin: 'https://plan.test', href: 'https://plan.test/index.html' },
            navigator: { onLine: isOnline },
            addEventListener(name, callback) { listeners.set(name, callback); },
            PlanMilT: {
                offlineManager: {
                    offlineZoomLevels: [8, 10, 12, 14, 15],
                    async getCachedTerrain(bounds, columns, rows) {
                        terrainLookups.push({ bounds, columns, rows });
                        return terrainResults[Math.min(terrainLookups.length - 1, terrainResults.length - 1)];
                    }
                },
                coverageImage: { getGroup: () => context.coverageGroup },
                map3dTexture: { async create(map, bounds, source, groups, zoom, options) {
                    textures.push(source);
                    textureOptions.push(options);
                    textureZooms.push(zoom);
                    context.lastGroups = Array.from(groups);
                    context.lastZoom = zoom;
                    return { image: 'data:image/png;base64,AA==', zoom: zoom ?? 12 };
                } },
                elevationFiles: {
                    async ensure(tiles) {
                        downloads.push(Array.from(tiles));
                        return ensure ? ensure(tiles) : true;
                    }
                },
                apiClient: {
                    async request(url, options) {
                        requests.push({ url, options });
                        const data = terrainResults[Math.min(requests.length - 1, terrainResults.length - 1)];
                        return {
                            ok: true,
                            async json() { return data; }
                        };
                    }
                }
            }
        }
    };
    context.coverageGroup = {};
    vm.runInNewContext(source, context);
    return {
        context, viewer, requests, messages, textures, textureOptions, overlay, frame, button, classes, downloads, listeners,
            context, viewer, requests, messages, textures, textureOptions, textureZooms, terrainLookups, overlay, frame, button, classes, downloads,
        click: () => click(),
        message(event) {
            if (event.data?.type === 'planmilt-3d-ready' && !frame.contentDocument) {
                this.setViewerLayout('offline-3d-presets-v2');
            }
            listeners.get('message')(event);
        },
        setViewerLayout(layout) {
            frame.contentDocument = {
                documentElement: {
                    getAttribute(name) { return name === 'data-planmilt-viewer-layout' ? layout : null; }
                }
            };
        }
    };
}

test('opens the embedded viewer, sends a snapshot, and returns to the unchanged map', async () => {
    const h = setup();
    h.click();
    assert.equal(h.frame.src, 'visualizador-3d.html');
    assert.equal(h.overlay.hidden, false);
    assert.ok(h.classes.has('map-3d-open'));
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    const dataMessage = h.messages.find(entry => entry.message.type === 'planmilt-3d-data');
    assert.equal(h.messages.find(entry => entry.message.type === 'planmilt-3d-connection').message.offline, false);
    assert.equal(dataMessage.origin, 'https://plan.test');
    assert.equal(dataMessage.message.payload.image, 'data:image/png;base64,AA==');
    assert.equal(dataMessage.message.payload.zoom, 12);
    assert.equal(dataMessage.message.payload.zoomRequested, 12);
    assert.deepEqual(Array.from(dataMessage.message.payload.bounds), [-21.7, -51.4, -21.4, -51.1]);
    assert.deepEqual(Array.from(dataMessage.message.payload.missingTiles), []);
    assert.deepEqual(h.requests.map(request => request.url), ['php/endpoints/elevation-terrain.php']);
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-close' } });
    assert.equal(h.overlay.hidden, true);
    assert.equal(h.button.focused, true);
    assert.equal(h.classes.has('map-3d-open'), false);
    h.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.requests.length, 2);
    assert.deepEqual(h.textureZooms, [12, 12]);
});

test('allows offline 3D rendering from cached textures without trying to download missing SRTM', async () => {
    const h = setup({
        isOnline: false,
        terrainResults: [{ elevations: [[100, null], [100, 110]], missingTiles: ['S22W052.HGT'] }],
        ensure() { throw new Error('não deve baixar tiles offline'); }
    });
    const openTopoLayer = { getTileUrl() {} };
    h.context.layerRegistry = { OpenTopo: openTopoLayer };
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    const dataMessage = h.messages.find(entry => entry.message.type === 'planmilt-3d-data');
    assert.equal(h.messages.find(entry => entry.message.type === 'planmilt-3d-connection').message.offline, true);
    assert.equal(h.textureOptions[0].offlineOnly, true);
    assert.equal(h.textureOptions[0].zoom, undefined);
    assert.equal(h.textureOptions[0].tileLayer, openTopoLayer);
    assert.equal(h.requests.length, 0);
    assert.equal(h.terrainLookups.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(h.terrainLookups[0].bounds)), {
        south: -21.7, west: -51.4, north: -21.4, east: -51.1
    });
    assert.deepEqual(h.downloads, []);
    h.context.window.navigator.onLine = true;
    h.listeners.get('online')();
    assert.equal(h.messages.filter(entry => entry.message.type === 'planmilt-3d-connection').at(-1).message.offline, false);
    assert.deepEqual(Array.from(dataMessage.message.payload.missingTiles), ['S22W052.HGT']);
    assert.equal(dataMessage.message.payload.zoomRequested, 12);
});

test('reloads a retained iframe when its 3D layout is outdated', async () => {
    const h = setup();
    h.frame.src = 'visualizador-3d.html';
    h.setViewerLayout('legacy');
    const navigationsBeforeOpen = h.frame.navigationCount;

    h.click();
    assert.equal(h.frame.navigationCount, navigationsBeforeOpen + 1);
    assert.equal(h.frame.src, 'visualizador-3d.html');
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.requests.length, 0);

    h.setViewerLayout('offline-3d-presets-v2');
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.requests.length, 1);
});

test('passes drawings, radio coverage and suggestions but not base and utility layers to texture capture', async () => {
    const h = setup();
    const drawings = h.context.drawnItems;
    const suggestions = {};
    const imported = {};
    h.context.layerRegistry = {
        OpenTopo: {}, 'BDGEx - CTM50': {}, 'Google Satellite': {},
        Infraestruturas: {}, 'Quadrículas - UTM': {},
        'Sugestão de Planejamento': suggestions, 'Desenhos importados': imported
    };
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(h.context.lastGroups, [drawings, h.context.coverageGroup, suggestions, imported]);
});

test('passes the requested base zoom and rejects invalid values', async () => {
    const h = setup();
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-refresh', source: 'opentopo', zoom: 14 } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.context.lastZoom, 14);
    assert.equal(h.messages.filter(entry => entry.message.type === 'planmilt-3d-data').at(-1).message.payload.zoom, 14);
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-refresh', source: 'opentopo', zoom: 19 } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.requests.length, 2);
});

test('confirms large requests and cancels an active capture when closing', async () => {
    const h = setup();
    let cancelSignal;
    h.context.Swal.fire = async options => {
        assert.match(options.text, /300 tiles/);
        return { isConfirmed: true };
    };
    h.context.window.PlanMilT.map3dTexture.create = async (map, bounds, source, groups, zoom, options) => {
        assert.equal(await options.confirmLargeRequest(300), true);
        options.onProgress(30, 300);
        cancelSignal = options.signal;
        return new Promise((resolve, reject) => cancelSignal.addEventListener('abort', () => reject(new Error('cancelado'))));
    };
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.ok(h.messages.some(entry => /30 de 300/.test(entry.message.message || '')));
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-close' } });
    assert.equal(cancelSignal.aborted, true);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.messages.filter(entry => entry.message.type === 'planmilt-3d-error').length, 0);
});

test('reports layer loading errors', async () => {
    const h = setup();
    h.context.window.PlanMilT.map3dTexture.create = async () => { throw new Error('Falha ao carregar tiles.'); };
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo', zoom: 15 } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(h.messages.find(entry => entry.message.type === 'planmilt-3d-error').message.message, /Falha ao carregar tiles/);
    assert.equal(h.messages.filter(entry => entry.message.type === 'planmilt-3d-data').length, 0);
});

test('only accepts OpenTopo or BDGEx from the embedded viewer', async () => {
    const h = setup();
    h.click();
    h.message({ origin: 'https://attacker.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.requests.length, 0);

    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'google' } });
    assert.equal(h.requests.length, 0);
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'bdgex' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(h.requests.map(request => request.url), ['php/endpoints/elevation-terrain.php']);
    const payload = h.messages.find(entry => entry.message.type === 'planmilt-3d-data').message.payload;
    assert.equal(payload.source, 'bdgex');
    assert.deepEqual(h.textures, ['bdgex']);
});

test('obtains missing tiles and requests terrain again before displaying it', async () => {
    const h = setup({ terrainResults: [
        { elevations: [[null, null], [null, null]], missingTiles: ['S22W052.HGT'] },
        { elevations: [[100, 110], [100, 110]], missingTiles: [] }
    ] });
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(h.downloads, [['S22W052.HGT']]);
    assert.equal(h.requests.length, 2);
    assert.deepEqual(Array.from(h.messages.find(entry => entry.message.type === 'planmilt-3d-data').message.payload.missingTiles), []);
});

test('keeps remaining missing tiles visible after upload cancellation or partial recovery', async () => {
    const missing = { elevations: [[null, 100], [100, 100]], missingTiles: ['S22W052.HGT'] };
    const h = setup({ terrainResults: [missing, missing], ensure: async () => false });
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.requests.length, 2);
    assert.deepEqual(Array.from(h.messages.find(entry => entry.message.type === 'planmilt-3d-data').message.payload.missingTiles), ['S22W052.HGT']);
});

test('reports recovery errors and ignores messages from other frames', async () => {
    const h = setup({
        terrainResults: [{ elevations: [[null, null], [null, null]], missingTiles: ['S22W052.HGT'] }],
        ensure: async () => { throw new Error('Falha no upload de elevação.'); }
    });
    h.click();
    h.message({ origin: 'https://plan.test', source: {}, data: { type: 'planmilt-3d-close' } });
    assert.equal(h.overlay.hidden, false);
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(h.messages.find(entry => entry.message.type === 'planmilt-3d-error').message.message, /Falha no upload/);
});

test('does not publish an outdated snapshot after closing and reopening', async () => {
    let finish;
    const h = setup({
        terrainResults: [{ elevations: [[null, null], [null, null]], missingTiles: ['S22W052.HGT'] }],
        ensure: () => new Promise(resolve => { finish = resolve; })
    });
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-close' } });
    h.click();
    finish(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.messages.filter(entry => entry.message.type === 'planmilt-3d-data').length, 0);
    assert.equal(h.downloads.length, 2);
    finish(false);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.messages.filter(entry => entry.message.type === 'planmilt-3d-data').length, 1);
});

test('the embedded renderer synchronizes offline state with its parent and provides a return control', () => {
    const messages = [];
    const events = {};
    const elements = {};
    for (const id of ['terrainCanvas', 'viewerConnectionStatus', 'viewerStatus', 'viewerWarnings', 'verticalExaggeration', 'verticalExaggerationValue', 'refreshViewer', 'resetCamera', 'closeViewer', 'baseLayer3D', 'baseZoom3D', 'applyBaseZoom', 'viewerAttribution', 'viewerControlFields', 'toggleViewerControls']) {
        elements[id] = { hidden: false, events: {}, addEventListener(name, callback) { this.events[name] = callback; }, setAttribute(name, value) { this[name] = value; } };
    }
    elements.terrainCanvas.getContext = () => null;
    elements.viewerConnectionStatus.hidden = true;
    elements.baseLayer3D.value = 'opentopo';
    elements.baseZoom3D.value = '';
    const host = { postMessage: (message, origin) => messages.push({ message, origin }) };
    const window = {
        parent: host, location: { origin: 'https://plan.test' },
        navigator: { onLine: true },
        matchMedia: () => ({ matches: true, addEventListener() {} }),
        addEventListener(name, callback) { events[name] = callback; }
    };
    vm.runInNewContext(viewerSource, { window, document: { getElementById: id => elements[id] } });
    events.message({ origin: 'https://attacker.test', source: host, data: { type: 'planmilt-3d-connection', offline: true } });
    assert.equal(elements.viewerConnectionStatus.hidden, true);
    events.message({ origin: 'https://plan.test', source: host, data: { type: 'planmilt-3d-connection', offline: true } });
    assert.equal(elements.viewerConnectionStatus.hidden, false);
    events.message({ origin: 'https://plan.test', source: host, data: { type: 'planmilt-3d-connection', offline: false } });
    assert.equal(elements.viewerConnectionStatus.hidden, true);
    elements.closeViewer.events.click();
    elements.refreshViewer.events.click();
    assert.deepEqual(messages.map(entry => entry.message.type), ['planmilt-3d-close', 'planmilt-3d-refresh']);
    elements.baseLayer3D.value = 'bdgex';
    elements.baseLayer3D.events.change();
    assert.equal(messages[2].message.source, 'bdgex');
    elements.baseZoom3D.value = '14';
    elements.applyBaseZoom.events.click();
    assert.equal(messages[3].message.zoom, 14);
    elements.baseZoom3D.value = '19';
    elements.applyBaseZoom.events.click();
    assert.equal(messages.length, 4);
    assert.match(elements.viewerStatus.textContent, /cinco níveis/);
    events.message({ origin: 'https://attacker.test', source: host, data: { type: 'planmilt-3d-error', message: 'malicioso' } });
    assert.notEqual(elements.viewerStatus.textContent, 'malicioso');
    events.message({ origin: 'https://plan.test', source: host, data: { type: 'planmilt-3d-error', message: 'erro' } });
    assert.equal(elements.viewerStatus.textContent, 'erro');
    elements.terrainCanvas.events.wheel({ preventDefault() {}, deltaY: 1 });
    assert.match(viewerHtml, /id="closeViewer"/);
    assert.match(viewerHtml, /id="verticalExaggeration"[^>]*max="10"[^>]*value="5"/);
    assert.match(indexSource, /id="map3DOverlay"[\s\S]*id="map3DFrame"/);
});

test('places the 3D button in the toolbar and loads its controller after map initialization', () => {
    assert.match(mainSource, /id="view3DButton"/);
    assert.match(mainSource, /<button id="view3DButton"[^>]*type="button"[^>]*aria-label="Abrir visualizador 3D"><i class="fas fa-cube" aria-hidden="true"><\/i><\/button>/);
    assert.match(indexSource, /main\.js[\s\S]*map-3d\.js/);
});

test('connection state, middle drag and two-finger gestures update the viewer correctly', () => {
    const elements = {};
    for (const id of ['terrainCanvas', 'viewerConnectionStatus', 'viewerStatus', 'viewerWarnings', 'verticalExaggeration', 'verticalExaggerationValue', 'refreshViewer', 'resetCamera', 'closeViewer', 'baseLayer3D', 'baseZoom3D', 'applyBaseZoom', 'viewerAttribution', 'viewerControlFields', 'toggleViewerControls']) {
        elements[id] = { hidden: false, events: {}, addEventListener(name, callback) { this.events[name] = callback; }, setAttribute(name, value) { this[name] = value; } };
    }
    elements.viewerConnectionStatus.hidden = true;
    let matrix;
    const gl = new Proxy({
        getShaderParameter: () => true,
        getProgramParameter: () => true,
        uniformMatrix4fv(location, transpose, value) { matrix = Array.from(value); }
    }, { get(target, key) { return key in target ? target[key] : () => ({}); } });
    const canvas = elements.terrainCanvas;
    canvas.getContext = () => gl;
    canvas.setPointerCapture = () => {};
    canvas.clientWidth = 800;
    canvas.clientHeight = 600;
    elements.baseLayer3D.value = 'opentopo';
    elements.baseZoom3D.value = '';
    elements.verticalExaggeration.value = '5';
    const host = { postMessage() {} };
    const events = {};
    const media = { matches: true, addEventListener(name, callback) { this[name] = callback; } };
    const window = {
        parent: host, location: { origin: 'https://plan.test' },
        navigator: { onLine: false },
        matchMedia: () => media,
        addEventListener(name, callback) { events[name] = callback; },
        PlanMilT: { map3dGeometry: { createMesh: () => ({
            width: 1000, depth: 1000, vertices: new Float32Array(20), indices: new Uint16Array([0, 1, 2])
        }) } }
    };
    class Image { set src(value) { this.onload(); } }
    vm.runInNewContext(viewerSource, { window, document: { getElementById: id => elements[id] }, Image });
    assert.equal(elements.viewerConnectionStatus.hidden, false);
    window.navigator.onLine = true;
    events.online();
    assert.equal(elements.viewerConnectionStatus.hidden, true);
    window.navigator.onLine = false;
    events.offline();
    assert.equal(elements.viewerConnectionStatus.hidden, false);
    events.message({ origin: 'https://plan.test', source: host, data: {
        type: 'planmilt-3d-data',
        payload: { image: 'data:image/png;base64,AA==', bounds: [-1, -1, 1, 1], zoom: 12, zoomRequested: null, missingTiles: ['S22W052.HGT'] }
    } });
    const initial = matrix;
    const toggle = elements.toggleViewerControls;
    const fields = elements.viewerControlFields;
    assert.equal(fields.hidden, true);
    assert.equal(toggle['aria-expanded'], 'false');
    assert.equal(toggle['aria-label'], 'Mostrar controles');
    assert.equal(elements.viewerStatus.hidden, true);
    assert.equal(elements.viewerWarnings.hidden, false);
    assert.match(elements.viewerAttribution.textContent, /OpenTopoMap/);
    toggle.events.click();
    assert.equal(fields.hidden, false);
    assert.equal(toggle['aria-expanded'], 'true');
    assert.equal(toggle['aria-label'], 'Ocultar controles');
    assert.equal(elements.viewerStatus.hidden, false);
    events.message({ origin: 'https://plan.test', source: host, data: { type: 'planmilt-3d-error', message: 'Falha ao atualizar.' } });
    assert.equal(elements.viewerStatus.hidden, false);
    toggle.events.click();
    assert.equal(fields.hidden, true);
    assert.equal(toggle['aria-expanded'], 'false');
    assert.equal(toggle['aria-label'], 'Mostrar controles');
    assert.equal(elements.baseZoom3D.value, '12');
    media.matches = false;
    media.change();
    assert.equal(fields.hidden, false);
    assert.equal(toggle['aria-expanded'], 'true');
    assert.equal(elements.viewerStatus.hidden, false);
    let prevented = false;
    canvas.events.pointerdown({ pointerType: 'mouse', pointerId: 1, button: 1, clientX: 100, clientY: 100, preventDefault() { prevented = true; } });
    canvas.events.pointermove({ pointerType: 'mouse', pointerId: 1, clientX: 160, clientY: 120 });
    canvas.events.pointerup({ pointerType: 'mouse', pointerId: 1 });
    assert.ok(prevented);
    assert.notDeepEqual(matrix, initial);
    const panned = matrix;
    events.message({ origin: 'https://plan.test', source: host, data: {
        type: 'planmilt-3d-data',
        payload: { image: 'data:image/png;base64,BB==', bounds: [-1, -1, 1, 1], zoom: 14, zoomRequested: 14, missingTiles: [] }
    } });
    assert.deepEqual(matrix, panned);
    assert.equal(elements.baseZoom3D.value, '14');
    elements.resetCamera.events.click();
    assert.deepEqual(matrix, initial);
    canvas.events.pointerdown({ pointerType: 'touch', pointerId: 2, clientX: 100, clientY: 100 });
    canvas.events.pointerdown({ pointerType: 'touch', pointerId: 3, clientX: 200, clientY: 100 });
    canvas.events.pointermove({ pointerType: 'touch', pointerId: 3, clientX: 240, clientY: 120 });
    assert.notDeepEqual(matrix, initial);
    elements.resetCamera.events.click();
    assert.deepEqual(matrix, initial);
});

test('3D zoom selector matches the five levels offered by offline packages', () => {
    const offlineLevels = offlineManagerSource.match(/OFFLINE_ZOOM_LEVELS = \[([^\]]+)\]/)[1]
        .split(',').map(value => Number(value.trim()));
    const viewerLevels = [...viewerHtml.matchAll(/<option value="(\d+)"/g)].map(match => Number(match[1]));
    assert.deepEqual(viewerLevels, offlineLevels);
    assert.match(viewerHtml, /id="baseZoom3D"[^>]*aria-label="Nível de detalhes da camada-base"/);
});

test('3D controls use a bottom-centered light toolbar on desktop and mobile', () => {
    assert.match(viewerHtml, /\.viewer-header\s*\{[^}]*left:\s*50%;\s*bottom:\s*16px;[\s\S]*?transform:\s*translateX\(-50%\)/);
    assert.match(viewerHtml, /\.viewer-controls\s*\{[^}]*background:\s*#f8f9fa;[^}]*pointer-events:\s*auto/);
    assert.match(viewerHtml, /\.viewer-messages\s*\{[^}]*top:\s*16px/);
    assert.match(viewerHtml, /@media \(max-width: 600px\), \(hover: none\) and \(pointer: coarse\)[\s\S]*?\.viewer-header\s*\{\s*bottom:\s*8px/);
    assert.match(viewerHtml, /\.viewer-actions\s*\{[^}]*flex-wrap:\s*nowrap/);
    assert.match(viewerHtml, /#viewerControlFields\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/);
    assert.match(viewerHtml, /class="fas fa-sync-alt viewer-action-icon"/);
    assert.match(viewerHtml, /class="fas fa-layer-group viewer-control-icon"/);
    assert.match(viewerHtml, /class="sr-only"/);
    assert.match(viewerHtml, /id="toggleViewerControls"[^>]*aria-controls="viewerControlFields"[^>]*aria-expanded="true"/);
    assert.match(viewerHtml, /data-planmilt-viewer-layout="offline-3d-presets-v2"/);
    assert.match(viewerHtml, /id="viewerAttribution"[\s\S]*id="viewerControlFields"/);
    assert.match(viewerHtml, /<div class="viewer-actions">\s*<span id="viewerConnectionStatus"[^>]*aria-label="Modo offline"[^>]*hidden>/);
    assert.match(viewerHtml, /#viewerConnectionStatus\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(cssSource, /body\.map-3d-open\s+\.offline-status\s*\{\s*display:\s*none/);
    assert.match(viewerHtml, /map-3d-viewer\.js/);
});
