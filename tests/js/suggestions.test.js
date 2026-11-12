const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/suggestions.js'), 'utf8');

function setup({ failStorage = false, failCreate = false } = {}) {
    const values = new Map();
    const calls = [];
    const dialogs = [];
    const errors = [];
    const records = [];
    const elements = {};
    let random = 0;
    const element = () => ({
        value: '', children: [], listeners: {}, textContent: '', hidden: false, disabled: false,
        append(...items) { this.children.push(...items); },
        appendChild(item) { this.children.push(item); },
        addEventListener(name, callback) { this.listeners[name] = callback; }
    });
    const document = {
        getElementById(id) { return elements[id] ||= element(); },
        createElement() { return element(); }
    };
    const localStorage = {
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { if (failStorage) throw new Error('armazenamento indisponível'); values.set(key, value); }
    };
    const Swal = {
        DismissReason: { cancel: 'cancel' },
        isLoading: () => false,
        showValidationMessage(message) { errors.push(message); },
        fire(config, ...args) {
            dialogs.push(config);
            if (args.length) errors.push(args[0]);
            if (config.didOpen) config.didOpen();
            return Promise.resolve({});
        }
    };
    const window = {
        location: { href: 'https://example.test/plan/index.html' },
        crypto: { getRandomValues(bytes) { bytes.fill(++random); return bytes; } },
        PlanMilT: { apiClient: { async postJson(endpoint, payload) {
            calls.push({ endpoint, ...payload });
            if (payload.action === 'list') return { suggestions: records };
            if (payload.action === 'create' && failCreate) {
                failCreate = false;
                throw new Error('rede');
            }
            return { success: true };
        } } }
    };
    vm.runInNewContext(source, { window, document, localStorage, Swal, URL, Uint8Array, TextEncoder, console });
    return { suggestions: window.PlanMilT.suggestions, elements, values, calls, dialogs, errors, records };
}

test('submission stores a private browser key and retries an uncertain send without changing its id', async () => {
    const f = setup({ failCreate: true });
    await f.suggestions.open();
    f.elements.newSuggestion.listeners.click();
    const dialog = f.dialogs.at(-1);
    f.elements.suggestionTitle.value = 'Minha ideia';
    f.elements.suggestionDescription.value = 'Detalhes';
    assert.equal(await dialog.preConfirm(), false);
    const key = 'planmilt.suggestions.v1:/plan/';
    const stored = JSON.parse(f.values.get(key));
    assert.match(stored.token, /^[a-f0-9]{64}$/);
    assert.match(stored.draft.requestId, /^[a-f0-9]{32}$/);
    f.elements.suggestionTitle.value = 'Texto diferente';
    assert.equal(await dialog.preConfirm(), false);
    assert.equal(f.calls.filter(call => call.action === 'create').length, 1);
    f.elements.suggestionTitle.value = 'Minha ideia';
    assert.equal(await dialog.preConfirm(), true);
    const creates = f.calls.filter(call => call.action === 'create');
    assert.equal(creates.length, 2);
    assert.equal(creates[0].requestId, creates[1].requestId);
    assert.equal(creates[0].token, stored.token);
    assert.equal(JSON.parse(f.values.get(key)).draft, null);
});

test('reviewed suggestions show the administrator response without an edit button', async () => {
    const f = setup();
    f.records.push({ id: 1, title: '<script>', description: 'Texto', status: 'acknowledged', admin_reply: '<resposta>' });
    await f.suggestions.open();
    const article = f.elements.suggestionsList.children[0];
    assert.equal(article.children[0].textContent, '<script>');
    assert.equal(article.children[3].textContent, 'Resposta: <resposta>');
    assert.equal(article.children.some(child => child.textContent === 'Editar'), false);
});

test('pending suggestions can be edited with the stored browser key', async () => {
    const f = setup();
    f.records.push({ id: 8, title: 'Ideia', description: 'Texto', status: 'pending', admin_reply: '', created_at: '2026-01-01 10:00:00' });
    await f.suggestions.open();
    const article = f.elements.suggestionsList.children[0];
    article.children.find(child => child.textContent === 'Editar').listeners.click();
    const dialog = f.dialogs.at(-1);
    assert.equal(f.elements.suggestionTitle.value, 'Ideia');
    f.elements.suggestionTitle.value = 'Ideia revista';
    assert.equal(await dialog.preConfirm(), true);
    const update = f.calls.find(call => call.action === 'update');
    assert.equal(update.id, 8);
    assert.equal(update.title, 'Ideia revista');
    assert.equal(update.token, JSON.parse(f.values.get('planmilt.suggestions.v1:/plan/')).token);
});

test('unavailable browser storage prevents requests and reports the failure', async () => {
    const f = setup({ failStorage: true });
    await f.suggestions.open();
    assert.equal(f.calls.length, 0);
    assert.ok(f.errors.some(message => /armazenamento indisponível/.test(message)));
});
