const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/map-3d.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '../../js/features/main.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function setup(images = []) {
    const listeners = new Map();
    const requests = [];
    const messages = [];
    let click;
    const viewer = {
        closed: false,
        focus() {},
        postMessage(message, origin) { messages.push({ message, origin }); }
    };
    const button = { addEventListener(name, callback) { click = callback; } };
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
            getElementById(id) { return id === 'map' ? mapElement : button; }
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
            open(url, name, options) {
                context.opened = { url, name, options };
                return viewer;
            },
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
                apiClient: {
                    async request(url, options) {
                        requests.push({ url, options });
                        return {
                            ok: true,
                            async json() {
                                return {
                                    elevations: Array.from({ length: 2 }, () => [100, 110]),
                                    missingTiles: ['S22W052.HGT']
                                };
                            }
                        };
                    }
                }
            }
        }
    };
    vm.runInNewContext(source, context);
    return {
        context, viewer, requests, messages, imageElements,
        click: () => click(),
        message(event) { listeners.get('message')(event); }
    };
}

test('opens a separate viewer and sends a read-only map snapshot after same-origin handshake', async () => {
    const h = setup();
    h.click();
    assert.equal(h.context.opened.url, 'visualizador-3d.html');
    assert.equal(h.context.opened.name, 'planmilt-3d');
    h.message({ origin: 'https://plan.test', source: h.viewer, data: { type: 'planmilt-3d-ready' } });
    await new Promise(resolve => setTimeout(resolve, 0));
    const dataMessage = h.messages.find(entry => entry.message.type === 'planmilt-3d-data');
    assert.equal(dataMessage.origin, 'https://plan.test');
    assert.equal(dataMessage.message.payload.image, 'data:image/png;base64,AA==');
    assert.deepEqual(Array.from(dataMessage.message.payload.bounds), [-21.7, -51.4, -21.4, -51.1]);
    assert.deepEqual(Array.from(dataMessage.message.payload.missingTiles), ['S22W052.HGT']);
    assert.deepEqual(h.requests.map(request => request.url), ['php/endpoints/elevation-terrain.php']);
});

test('does not trust another origin and excludes Google Satellite without proxying it', async () => {
    const tile = 'https://mt0.google.com/vt/lyrs=s&x=1&y=1&z=2';
    const h = setup([tile]);
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

test('places the 3D button beside Help and loads its controller after map initialization', () => {
    assert.match(mainSource, /id="helpButton"[\s\S]*id="view3DButton"/);
    assert.match(indexSource, /main\.js[\s\S]*map-3d\.js/);
});
