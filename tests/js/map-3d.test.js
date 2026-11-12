const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/map-3d.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '../../js/features/main.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const viewerSource = fs.readFileSync(path.join(__dirname, '../../js/features/map-3d-viewer.js'), 'utf8');
const viewerHtml = fs.readFileSync(path.join(__dirname, '../../visualizador-3d.html'), 'utf8');

function setup({ terrainResults = [{ elevations: [[100, 110], [100, 110]], missingTiles: [] }], ensure } = {}) {
    const listeners = new Map();
    const requests = [];
    const messages = [];
    let click;
    const viewer = { postMessage(message, origin) { messages.push({ message, origin }); } };
    const button = { addEventListener(name, callback) { click = callback; }, focus() { this.focused = true; } };
    const overlay = { hidden: true };
    const frame = {
        contentWindow: viewer,
        src: '',
        getAttribute(name) { return name === 'src' ? this.src : null; },
        focus() { this.focused = true; }
    };
    const classes = new Set();
    const downloads = [];
    const textures = [];
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
            addEventListener(name, callback) { listeners.set(name, callback); },
            PlanMilT: {
                map3dTexture: { async create(map, bounds, source, groups, zoom) {
                    textures.push(source);
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
    vm.runInNewContext(source, context);
    return {
        context, viewer, requests, messages, textures, overlay, frame, button, classes, downloads,
        click: () => click(),
        message(event) { listeners.get('message')(event); }
    };
}

test('opens the embedded viewer, sends a snapshot, and returns to the unchanged map', async () => {
    const h = setup();
    h.click();
    assert.equal(h.frame.src, 'visualizador-3d.html?v=20261112-tiles');
    assert.equal(h.overlay.hidden, false);
    assert.ok(h.classes.has('map-3d-open'));
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    const dataMessage = h.messages.find(entry => entry.message.type === 'planmilt-3d-data');
    assert.equal(dataMessage.origin, 'https://plan.test');
    assert.equal(dataMessage.message.payload.image, 'data:image/png;base64,AA==');
    assert.equal(dataMessage.message.payload.zoom, 12);
    assert.equal(dataMessage.message.payload.zoomRequested, null);
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
});

test('passes drawings and registered overlays but not base and utility layers to texture capture', async () => {
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
    assert.deepEqual(h.context.lastGroups, [drawings, suggestions, imported]);
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
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready', source: 'opentopo', zoom: 18 } });
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

test('the embedded renderer communicates only with its parent and provides a return control', () => {
    const messages = [];
    const events = {};
    const elements = {};
    for (const id of ['terrainCanvas', 'viewerStatus', 'viewerWarnings', 'verticalExaggeration', 'verticalExaggerationValue', 'refreshViewer', 'resetCamera', 'closeViewer', 'baseLayer3D', 'baseZoom3D', 'applyBaseZoom', 'viewerAttribution']) {
        elements[id] = { events: {}, addEventListener(name, callback) { this.events[name] = callback; } };
    }
    elements.terrainCanvas.getContext = () => null;
    elements.baseLayer3D.value = 'opentopo';
    elements.baseZoom3D.value = '';
    const host = { postMessage: (message, origin) => messages.push({ message, origin }) };
    const window = {
        parent: host, location: { origin: 'https://plan.test' },
        addEventListener(name, callback) { events[name] = callback; }
    };
    vm.runInNewContext(viewerSource, { window, document: { getElementById: id => elements[id] } });
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
    assert.match(elements.viewerStatus.textContent, /entre 0 e 18/);
    events.message({ origin: 'https://attacker.test', source: host, data: { type: 'planmilt-3d-error', message: 'malicioso' } });
    assert.notEqual(elements.viewerStatus.textContent, 'malicioso');
    events.message({ origin: 'https://plan.test', source: host, data: { type: 'planmilt-3d-error', message: 'erro' } });
    assert.equal(elements.viewerStatus.textContent, 'erro');
    elements.terrainCanvas.events.wheel({ preventDefault() {}, deltaY: 1 });
    assert.match(viewerHtml, /id="closeViewer"/);
    assert.match(viewerHtml, /id="verticalExaggeration"[^>]*max="10"[^>]*value="5"/);
    assert.match(indexSource, /id="map3DOverlay"[\s\S]*id="map3DFrame"/);
});

test('places the 3D button beside Help and loads its controller after map initialization', () => {
    assert.match(mainSource, /id="helpButton"[\s\S]*id="view3DButton"/);
    assert.match(indexSource, /main\.js[\s\S]*map-3d\.js/);
});

test('middle drag and two-finger gestures move the view and reset restores it', () => {
    const elements = {};
    for (const id of ['terrainCanvas', 'viewerStatus', 'viewerWarnings', 'verticalExaggeration', 'verticalExaggerationValue', 'refreshViewer', 'resetCamera', 'closeViewer', 'baseLayer3D', 'baseZoom3D', 'applyBaseZoom', 'viewerAttribution']) {
        elements[id] = { events: {}, addEventListener(name, callback) { this.events[name] = callback; } };
    }
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
    const window = {
        parent: host, location: { origin: 'https://plan.test' },
        addEventListener(name, callback) { events[name] = callback; },
        PlanMilT: { map3dGeometry: { createMesh: () => ({
            width: 1000, depth: 1000, vertices: new Float32Array(20), indices: new Uint16Array([0, 1, 2])
        }) } }
    };
    class Image { set src(value) { this.onload(); } }
    vm.runInNewContext(viewerSource, { window, document: { getElementById: id => elements[id] }, Image });
    events.message({ origin: 'https://plan.test', source: host, data: {
        type: 'planmilt-3d-data',
        payload: { image: 'data:image/png;base64,AA==', bounds: [-1, -1, 1, 1], zoom: 12, zoomRequested: null, missingTiles: [] }
    } });
    const initial = matrix;
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
