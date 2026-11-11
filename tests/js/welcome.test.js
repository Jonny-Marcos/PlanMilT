const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/welcome.js'), 'utf8');

function setup(initial, options = {}) {
    const values = new Map(initial ? Object.entries(initial) : []);
    const errors = [];
    const calls = [];
    const opened = [];
    const elements = {};
    const element = () => ({
        children: [],
        listeners: {},
        textContent: '',
        addEventListener(type, handler) { this.listeners[type] = handler; },
        appendChild(child) { this.children.push(child); }
    });
    for (const id of ['welcomeRecent', 'welcomeShow', 'welcomeStorageError', 'welcomeTip']) elements[id] = element();
    const localStorage = {
        getItem(key) { if (options.failRead) throw new Error('indisponível'); return values.get(key) || null; },
        setItem(key, value) { if (options.failWrite) throw new Error('quota'); values.set(key, value); }
    };
    const window = { location: { href: 'https://example.test/plan/index.html' }, PlanMilT: {
        drawingLoading: { load(name) { opened.push(name); } },
        showButtonGuide() { calls.push('guide'); }
    } };
    const Swal = {
        DismissReason: { cancel: 'cancel' },
        close() { calls.push('close'); },
        fire(config) { calls.push(config); config.didOpen(); return Promise.resolve({ dismiss: options.dismiss }); }
    };
    vm.runInNewContext(source, {
        window, localStorage, Swal, URL,
        document: { getElementById: id => elements[id], createElement: element },
        console: { error(...args) { errors.push(args); } }
    });
    return { welcome: window.PlanMilT.welcome, values, elements, errors, calls, opened };
}

const key = 'planmilt.welcome.v1:/plan/';

test('recent list is deduplicated, bounded and contains no credentials or drawing data', () => {
    const fixture = setup();
    for (let i = 0; i < 12; i++) assert.equal(fixture.welcome.record(`nome-${i}`), true);
    fixture.welcome.record('nome-5');
    const state = JSON.parse(fixture.values.get(key));
    assert.equal(state.recent.length, 10);
    assert.equal(state.recent[0].name, 'nome-5');
    assert.equal(state.recent.filter(item => item.name === 'nome-5').length, 1);
    assert.deepEqual(Object.keys(state.recent[0]).sort(), ['date', 'name']);
    assert.equal(state.hidden, false);
});

test('welcome preference can be disabled and re-enabled from the manual screen', () => {
    const fixture = setup();
    fixture.welcome.show(true);
    fixture.elements.welcomeShow.checked = false;
    fixture.elements.welcomeShow.listeners.change();
    assert.equal(JSON.parse(fixture.values.get(key)).hidden, true);
    fixture.welcome.show(true);
    assert.equal(fixture.calls.length, 1);
    fixture.welcome.show();
    fixture.elements.welcomeShow.checked = true;
    fixture.elements.welcomeShow.listeners.change();
    fixture.welcome.show(true);
    assert.equal(fixture.calls.length, 3);
});

test('recent names are rendered as text and open through the shared loader', () => {
    const fixture = setup();
    const name = '<img src=x onerror=alert(1)>';
    fixture.welcome.record(name);
    fixture.welcome.show();
    const button = fixture.elements.welcomeRecent.children[0];
    assert.ok(button.textContent.startsWith(name));
    assert.equal(button.innerHTML, undefined);
    button.listeners.click();
    assert.deepEqual(fixture.opened, [name]);
    assert.equal(fixture.calls.at(-1), 'close');
});

test('guide button opens the existing button guide', async () => {
    const fixture = setup(undefined, { dismiss: 'cancel' });
    fixture.welcome.show();
    await Promise.resolve();
    assert.equal(fixture.calls.at(-1), 'guide');
});

test('storage failures and invalid stored data are reported without disrupting other operations', () => {
    for (const fixture of [
        setup(undefined, { failRead: true }),
        setup(undefined, { failWrite: true }),
        setup({ [key]: '{invalid' })
    ]) {
        assert.equal(fixture.welcome.record('teste'), false);
        assert.ok(fixture.errors.length);
        fixture.welcome.show();
        fixture.elements.welcomeShow.checked = false;
        fixture.elements.welcomeShow.listeners.change();
        assert.match(fixture.elements.welcomeStorageError.textContent, /Não foi possível/);
    }
});

test('welcome selects a tip for each opening without adding it to local storage', () => {
    const fixture = setup();
    fixture.welcome.show();
    const tip = fixture.elements.welcomeTip.textContent;
    assert.ok(tip.length > 10);
    assert.equal(fixture.values.size, 0);
    fixture.welcome.show();
    assert.ok(fixture.elements.welcomeTip.textContent.length > 10);
});

test('tips are chosen from different positions using random values', () => {
    const fixture = setup();
    const originalRandom = Math.random;
    try {
        Math.random = () => 0;
        fixture.welcome.show();
        const first = fixture.elements.welcomeTip.textContent;
        Math.random = () => 0.999;
        fixture.welcome.show();
        assert.notEqual(fixture.elements.welcomeTip.textContent, first);
    } finally {
        Math.random = originalRandom;
    }
});
