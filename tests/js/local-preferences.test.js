const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/local-preferences.js'), 'utf8');

function load(store = new Map(), pathname = '/app/') {
    const errors = [];
    const sandbox = {
        window: { location: { href: `http://localhost${pathname}index.html` } },
        URL,
        Event: class { constructor(type) { this.type = type; } },
        localStorage: {
            getItem: key => (store.has(key) ? store.get(key) : null),
            setItem: (key, value) => store.set(key, value)
        },
        console: { error: (...args) => errors.push(args) }
    };
    vm.runInNewContext(source, sandbox);
    return { api: sandbox.window.PlanMilT.localPreferences, store, errors };
}

function field(id, type, value, extra = {}) {
    return { id, type, value, tagName: 'INPUT', dispatchEvent() {}, ...extra };
}

test('most used value wins, with fallback and validation', () => {
    const { api } = load();
    assert.equal(api.mostUsed('manualResolution', 180), 180);
    api.recordUse('manualResolution', 360);
    api.recordUse('manualResolution', 72);
    api.recordUse('manualResolution', 360);
    api.recordUse('manualResolution', 999);
    assert.equal(api.mostUsed('manualResolution', 180), 360);
    api.recordUse('taskAntennaHeight', -1);
    assert.equal(api.mostUsed('taskAntennaHeight', 1.5), 1.5);
});

test('preferences are isolated by install path and invalid data is ignored', () => {
    const first = load(new Map(), '/a/');
    first.api.setUi('transparency', 40);
    first.api.setUi('transparency', 500);
    assert.equal(first.api.getUi('transparency', 100), 40);
    const store = first.store;
    const other = load(store, '/b/');
    assert.equal(other.api.getUi('transparency', 100), 100);
    store.set(Array.from(store.keys())[0], '{broken');
    const broken = load(store, '/a/');
    assert.equal(broken.api.getUi('transparency', 100), 100);
    assert.equal(broken.errors.length, 1);
});

test('task draft is stored, restored into fields and cleared', () => {
    const { api } = load();
    const text = field('maxDistance', 'number', '12');
    const select = field('preset', 'select-one', 'harris_hh', { tagName: 'SELECT', options: [{ value: 'harris_hh' }, { value: 'optical' }] });
    const secret = field('pwd', 'password', 'x');
    const root = { querySelectorAll: () => [text, select, secret], querySelector: () => null };
    const captured = api.captureFields(root);
    assert.deepEqual(JSON.parse(JSON.stringify(captured)), { maxDistance: '12', preset: 'harris_hh' });
    api.setDraft('verifyRadioLinks', captured);
    assert.equal(api.getDraft().task, 'verifyRadioLinks');
    text.value = '';
    select.value = 'optical';
    api.applyFields(root, api.getDraft().fields);
    assert.equal(text.value, '12');
    assert.equal(select.value, 'harris_hh');
    api.clearDraft();
    assert.equal(api.getDraft(), null);
});

test('manual radio form adjustments are kept per preset and invalid ones are rejected', () => {
    const { api } = load();
    const form = { presetId: 'custom', mode: 'coverage', freq: 150, txPower: 40, txGain: 2, txHeight: 3, rxGain: 0,
        rxHeight: 1.5, rxSens: -100, radius: 8, radialCount: 360, penetration: 'low', isOptical: false };
    api.setRadioForm(form);
    api.setRadioForm({ ...form, presetId: 'harris_hh', radius: 30 });
    assert.equal(api.getRadioForm('custom').radius, 8);
    assert.equal(api.getRadioForm('harris_hh').radius, 30);
    assert.equal(api.getRadioForm().presetId, 'harris_hh');
    assert.equal(api.getRadioForm('optical'), null);
    assert.equal(api.getRadioForm('custom').isOptical, undefined);
    api.setRadioForm({ ...form, radius: 5, radialCount: 7 });
    assert.equal(api.getRadioForm('custom').radius, 8);
});
