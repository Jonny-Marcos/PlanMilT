const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const proj4 = require('../../js/library/proj4.js');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/map-point-info.js'), 'utf8');

function createHarness(request = async () => [{ elevation: 123 }]) {
    const listeners = {};
    const touchListeners = {};
    const timers = new Map();
    const popups = [];
    const requests = [];
    let timerId = 0;
    const createElement = tag => ({
        tag, children: [], attributes: {}, textContent: '',
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { this.attributes[name] = value; }
    });
    const container = {
        style: {},
        addEventListener(name, callback) { touchListeners[name] = callback; }
    };
    const map = {
        getContainer: () => container,
        mouseEventToLatLng: () => ({ lat: -21.5699, lng: -51.2457 }),
        on(names, callback) { names.split(' ').forEach(name => { listeners[name] = callback; }); }
    };
    const leaflet = {
        popup() {
            return {
                setLatLng(value) { this.latlng = value; return this; },
                setContent(value) { this.content = value; return this; },
                openOn() { popups.push(this); return this; }
            };
        }
    };
    const window = {};
    const context = {
        window, document: { createElement }, console: { error() {} },
        setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
        clearTimeout(id) { timers.delete(id); }
    };
    vm.runInNewContext(source, context);
    window.PlanMilT.mapPointInfo.attach({
        map, leaflet, projection: proj4,
        apiClient: { async postJson(url, payload) { requests.push({ url, payload }); return request(); } }
    });
    const runTimers = () => {
        const pending = [...timers.values()];
        timers.clear();
        pending.forEach(callback => callback());
    };
    return { listeners, touchListeners, popups, requests, runTimers, container };
}

function row(popup, index) {
    return popup.content.children[index].children[1].textContent;
}

test('right click shows WGS84 decimal, DMS, UTM, SRTM elevation and an external Street View link', async () => {
    const fixture = createHarness();
    fixture.listeners.contextmenu({ latlng: { lat: -21.5699, lng: -51.2457 } });
    await new Promise(resolve => setImmediate(resolve));
    const popup = fixture.popups[0];
    assert.equal(row(popup, 1), '-21.569900, -51.245700');
    assert.equal(row(popup, 2), '21° 34′ 11.64″ S, 51° 14′ 44.52″ O');
    assert.equal(row(popup, 3), 'Zona 22S · E 474563 m · N 7614758 m');
    assert.equal(row(popup, 4), '123 m');
    assert.equal(fixture.requests[0].url, 'elevation-profile.php');
    const link = popup.content.children[5];
    const url = new URL(link.href);
    assert.equal(url.origin, 'https://www.google.com');
    assert.equal(url.searchParams.get('map_action'), 'pano');
    assert.equal(url.searchParams.get('viewpoint'), '-21.5699,-51.2457');
    assert.equal(link.rel, 'noopener noreferrer');
});

test('normalizes wrapped longitude, handles special UTM zones and reports missing elevation', async () => {
    const fixture = createHarness(async () => { throw new Error('Arquivos de elevação faltando'); });
    fixture.listeners.contextmenu({ latlng: { lat: 60, lng: 365 } });
    await new Promise(resolve => setImmediate(resolve));
    const popup = fixture.popups[0];
    assert.equal(row(popup, 1), '60.000000, 5.000000');
    assert.match(row(popup, 3), /^Zona 32N/);
    assert.match(row(popup, 4), /Indisponível/);
    fixture.listeners.contextmenu({ latlng: { lat: 85, lng: 0 } });
    assert.match(row(fixture.popups[1], 3), /fora da faixa UTM/);
    fixture.listeners.contextmenu({ latlng: { lat: 75, lng: 15 } });
    assert.match(row(fixture.popups[2], 3), /^Zona 33N/);
    fixture.listeners.contextmenu({ latlng: { lat: 0, lng: 180 } });
    assert.match(row(fixture.popups[3], 3), /^Zona 60N/);
});

test('invalid and void elevation values are not presented as altitude', async () => {
    for (const elevation of ['N/A', -32768, null]) {
        const fixture = createHarness(async () => [{ elevation }]);
        fixture.listeners.contextmenu({ latlng: { lat: 0, lng: 0 } });
        await new Promise(resolve => setImmediate(resolve));
        assert.match(row(fixture.popups[0], 4), /Indisponível/);
    }
});

test('long touch opens once, cancels on movement and does not interfere with drawing or controls', () => {
    const fixture = createHarness();
    const target = { closest: () => null };
    const touch = { clientX: 10, clientY: 10 };
    fixture.touchListeners.touchstart({ target, touches: [touch] });
    fixture.runTimers();
    assert.equal(fixture.popups.length, 1);
    fixture.listeners.contextmenu({ latlng: { lat: 0, lng: 0 } });
    assert.equal(fixture.popups.length, 1);
    let prevented = false;
    fixture.touchListeners.touchend({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    fixture.runTimers();
    fixture.touchListeners.touchstart({ target, touches: [touch] });
    fixture.touchListeners.touchmove({ touches: [{ clientX: 25, clientY: 10 }] });
    fixture.runTimers();
    assert.equal(fixture.popups.length, 1);
    fixture.listeners['draw:drawstart']();
    fixture.touchListeners.touchstart({ target, touches: [touch] });
    fixture.runTimers();
    assert.equal(fixture.popups.length, 1);
    fixture.listeners['draw:drawstop']();
    fixture.touchListeners.touchstart({ target: { closest: () => ({}) }, touches: [touch] });
    fixture.runTimers();
    assert.equal(fixture.popups.length, 1);
});

test('native touch context menu cancels the long-press timer and does not open twice', () => {
    const fixture = createHarness();
    fixture.touchListeners.touchstart({
        target: { closest: () => null },
        touches: [{ clientX: 10, clientY: 10 }]
    });
    fixture.listeners.contextmenu({ latlng: { lat: 1, lng: 2 } });
    fixture.runTimers();
    assert.equal(fixture.popups.length, 1);
    let prevented = false;
    fixture.touchListeners.touchend({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
});
