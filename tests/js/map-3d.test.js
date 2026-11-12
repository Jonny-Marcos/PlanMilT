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

function setup({ images = [], terrainResults = [{ elevations: [[100, 110], [100, 110]], missingTiles: [] }], ensure } = {}) {
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
    const imageElements = images.map(src => ({
        src,
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 256, height: 256 })
    }));
    const mapElement = {
        clientWidth: 800,
        clientHeight: 600,
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600 }),
        querySelectorAll: selector => selector === 'img' ? imageElements : []
    };
    const context = {
        URL,
        document: {
            body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name) } },
            getElementById(id) {
                return { map: mapElement, view3DButton: button, map3DOverlay: overlay, map3DFrame: frame }[id];
            }
        },
        map: {
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
            html2canvas: async (element, options) => {
                const clonedImages = images.map(src => ({ src, style: {} }));
                const cloneMap = {
                    querySelectorAll(selector) {
                        if (selector === '.leaflet-control-container, .map-toolbar') return [];
                        if (selector === 'img') return clonedImages;
                        if (selector === 'canvas') return [];
                        return [];
                    }
                };
                await options.onclone({ getElementById: () => cloneMap });
                return { toDataURL: () => 'data:image/png;base64,AA==' };
            },
            PlanMilT: {
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
        context, viewer, requests, messages, imageElements, overlay, frame, button, classes, downloads,
        click: () => click(),
        message(event) { listeners.get('message')(event); }
    };
}

test('opens the embedded viewer, sends a snapshot, and returns to the unchanged map', async () => {
    const h = setup();
    h.click();
    assert.equal(h.frame.src, 'visualizador-3d.html?v=20261112-3d-integrated');
    assert.equal(h.overlay.hidden, false);
    assert.ok(h.classes.has('map-3d-open'));
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    const dataMessage = h.messages.find(entry => entry.message.type === 'planmilt-3d-data');
    assert.equal(dataMessage.origin, 'https://plan.test');
    assert.equal(dataMessage.message.payload.image, 'data:image/png;base64,AA==');
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

test('does not trust another origin and excludes Google Satellite without proxying it', async () => {
    const tile = 'https://mt0.google.com/vt/lyrs=s&x=1&y=1&z=2';
    const h = setup({ images: [tile] });
    h.click();
    h.message({ origin: 'https://attacker.test', source: h.viewer, data: { type: 'planmilt-3d-ready' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(h.requests.length, 0);

    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(h.requests.map(request => request.url), ['php/endpoints/elevation-terrain.php']);
    const payload = h.messages.find(entry => entry.message.type === 'planmilt-3d-data').message.payload;
    assert.deepEqual(Array.from(payload.unavailableLayers), ['Google Satellite']);
});

test('obtains missing tiles and requests terrain again before displaying it', async () => {
    const h = setup({ terrainResults: [
        { elevations: [[null, null], [null, null]], missingTiles: ['S22W052.HGT'] },
        { elevations: [[100, 110], [100, 110]], missingTiles: [] }
    ] });
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(h.downloads, [['S22W052.HGT']]);
    assert.equal(h.requests.length, 2);
    assert.deepEqual(Array.from(h.messages.find(entry => entry.message.type === 'planmilt-3d-data').message.payload.missingTiles), []);
});

test('keeps remaining missing tiles visible after upload cancellation or partial recovery', async () => {
    const missing = { elevations: [[null, 100], [100, 100]], missingTiles: ['S22W052.HGT'] };
    const h = setup({ terrainResults: [missing, missing], ensure: async () => false });
    h.click();
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready' } });
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
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready' } });
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
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready' } });
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
    for (const id of ['terrainCanvas', 'viewerStatus', 'viewerWarnings', 'verticalExaggeration', 'verticalExaggerationValue', 'refreshViewer', 'resetCamera', 'closeViewer']) {
        elements[id] = { events: {}, addEventListener(name, callback) { this.events[name] = callback; } };
    }
    elements.terrainCanvas.getContext = () => null;
    const host = { postMessage: (message, origin) => messages.push({ message, origin }) };
    const window = {
        parent: host, location: { origin: 'https://plan.test' },
        addEventListener(name, callback) { events[name] = callback; }
    };
    vm.runInNewContext(viewerSource, { window, document: { getElementById: id => elements[id] } });
    elements.closeViewer.events.click();
    elements.refreshViewer.events.click();
    assert.deepEqual(messages.map(entry => entry.message.type), ['planmilt-3d-close', 'planmilt-3d-refresh']);
    events.message({ origin: 'https://attacker.test', source: host, data: { type: 'planmilt-3d-error', message: 'malicioso' } });
    assert.notEqual(elements.viewerStatus.textContent, 'malicioso');
    events.message({ origin: 'https://plan.test', source: host, data: { type: 'planmilt-3d-error', message: 'erro' } });
    assert.equal(elements.viewerStatus.textContent, 'erro');
    elements.terrainCanvas.events.wheel({ preventDefault() {}, deltaY: 1 });
    assert.match(viewerHtml, /id="closeViewer"/);
    assert.match(indexSource, /id="map3DOverlay"[\s\S]*id="map3DFrame"/);
});

test('places the 3D button beside Help and loads its controller after map initialization', () => {
    assert.match(mainSource, /id="helpButton"[\s\S]*id="view3DButton"/);
    assert.match(indexSource, /main\.js[\s\S]*map-3d\.js/);
});
