const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ms = require('milsymbol');
const catalog = require('milstandard-e');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/military-symbols.js'), 'utf8');
const translationsSource = fs.readFileSync(path.join(__dirname, '../../js/features/military-symbol-translations.js'), 'utf8');

test('local browser bundles expose the documented generator and catalogue without npm at runtime', () => {
    const root = path.join(__dirname, '../../js/library');
    const context = {};
    vm.runInNewContext(fs.readFileSync(path.join(root, 'milsymbol.min.js'), 'utf8'), context);
    vm.runInNewContext(fs.readFileSync(path.join(root, 'milstandard-e.js'), 'utf8'), context);
    assert.equal(new context.ms.Symbol('13031000141211000000').isValid(), true);
    assert.ok(context.milstd2525.ms2525e['10'].mainIcon.length > 200);
});

function setup(symbolCatalog = catalog) {
    const values = new Map();
    const elements = {};
    let active;
    let failStorage = false;
    class Element {
        constructor() { this.options = []; this.listeners = {}; this.value = ''; this.textContent = ''; this.selectedIndex = -1; }
        appendChild(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; }
        replaceChildren() { this.options = []; this.value = ''; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        dispatch(name) { this.listeners[name]({ target: this }); }
        removeAttribute(name) { delete this[name]; }
    }
    const document = {
        getElementById(id) { return elements[id] ||= new Element(); },
        createElement() { return new Element(); }
    };
    document.getElementById('symbolName');
    const window = { location: { href: 'https://example.test/plan/' }, ms, milstd2525: symbolCatalog };
    const Swal = {
        fire(options) { active = options; options.didOpen(); return new Promise(resolve => { active.finish = resolve; }); },
        showValidationMessage(message) { active.validation = message; }
    };
    const localStorage = {
        getItem(key) { if (failStorage) throw new Error('bloqueado'); return values.get(key) || null; },
        setItem(key, value) { if (failStorage) throw new Error('bloqueado'); values.set(key, value); }
    };
    const context = { window, document, Swal, localStorage, URL, console: { error() {} } };
    vm.runInNewContext(translationsSource, context);
    vm.runInNewContext(source, context);
    return { symbols: window.PlanMilT.militarySymbols, elements, values, active: () => active, failStorage() { failStorage = true; } };
}

test('real library renders valid SIDC and rejects invalid symbols', () => {
    const { symbols } = setup();
    const data = symbols.render({ sidc: '13031000141211000000', options: { uniqueDesignation: '1 Btl' } });
    assert.match(data.iconUrl, /^data:image\/svg\+xml/);
    assert.ok(data.iconSize[0] > 0);
    assert.equal(data.config.options.uniqueDesignation, '1 Btl');
    assert.throws(() => symbols.render({ sidc: '123', options: {} }), /SIDC/);
    assert.throws(() => symbols.render({ sidc: '13031000141211000000', options: { uniqueDesignation: 'a'.repeat(51) } }), /50/);
});

test('all catalog terms have nonempty local translations', () => {
    const context = { window: {} };
    vm.runInNewContext(translationsSource, context);
    const translations = context.window.PlanMilT.militarySymbolTranslations;
    for (const [code, group] of Object.entries(catalog.ms2525e)) {
        const terms = [code === 'common' ? '' : group.name];
        for (const entry of group.mainIcon) terms.push(entry.Entity, entry['Entity Type'], entry['Entity Subtype']);
        for (const entry of [...group.modifier1, ...group.modifier2]) terms.push(entry['First Modifier'], entry['Second Modifier']);
        for (const term of terms.filter(value => value && value.trim())) {
            const translated = translations[term.trim()];
            assert.ok(typeof translated === 'string' && translated.trim(), `Sem tradução: ${term}`);
            assert.doesNotMatch(translated, /⁇|�/, `Tradução inválida: ${term}`);
        }
    }
});

test('editor searches translated and original names without changing symbol codes', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    assert.ok(e.symbolSet.options.some(option => option.value === '10' && /Unidade terrestre/i.test(option.textContent)));
    e.symbolSearch.value = 'infantaria';
    e.symbolSearch.dispatch('input');
    assert.ok(e.symbolEntity.options.some(option => option.value === '121100' && /infantaria/i.test(option.textContent)));
    e.symbolSearch.value = 'infantry';
    e.symbolSearch.dispatch('input');
    assert.ok(e.symbolEntity.options.some(option => option.value === '121100'));
    e.symbolSearch.value = 'COMUNICACOES';
    e.symbolSearch.dispatch('input');
    assert.ok(e.symbolEntity.options.some(option => /comunicações/i.test(option.textContent)));
    e.symbolSearch.value = '121100';
    e.symbolSearch.dispatch('input');
    assert.ok(e.symbolEntity.options.some(option => option.value === '121100'));
    assert.equal(e.symbolSidc.value, '13031000141211000000');
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('editor explicitly marks new catalog terms without a translation', async () => {
    const group = catalog.ms2525e['10'];
    const symbolCatalog = { ms2525e: { ...catalog.ms2525e, '10': {
        ...group, mainIcon: [...group.mainIcon, { Code: '999999', Entity: 'Untranslated Test Term' }]
    } } };
    const fixture = setup(symbolCatalog);
    const pending = fixture.symbols.open();
    assert.ok(fixture.elements.symbolEntity.options.some(option =>
        option.value === '999999' && option.textContent.includes('Untranslated Test Term (sem tradução)')));
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('translated options retain every original entity and modifier code', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    for (const [code, group] of Object.entries(catalog.ms2525e)) {
        if (code === 'common') continue;
        e.symbolSet.value = code;
        e.symbolSet.dispatch('change');
        const entityCodes = group.mainIcon.filter(item => /^\d{6}$/.test(item.Code)).map(item => item.Code);
        assert.deepEqual(e.symbolEntity.options.map(option => option.value), entityCodes, `Tipos da categoria ${code}`);
        for (const [id, key] of [['symbolModifier1', 'modifier1'], ['symbolModifier2', 'modifier2']]) {
            const codes = ['000'];
            for (const item of [...group[key], ...catalog.ms2525e.common[key]]) {
                if (/^\d{2,3}$/.test(item.Code) && !codes.includes(item.Code.padStart(3, '0'))) {
                    codes.push(item.Code.padStart(3, '0'));
                }
            }
            assert.deepEqual(e[id].options.map(option => option.value), codes, `${id} da categoria ${code}`);
        }
    }
    fixture.active().finish({ isConfirmed: false });
    await pending;
});

test('editor exposes complete category and modifier catalog, validates and stores reusable templates', async () => {
    const fixture = setup();
    const pending = fixture.symbols.open();
    const e = fixture.elements;
    assert.ok(e.symbolSet.options.length >= 20);
    assert.ok(e.symbolEntity.options.length > 200);
    assert.ok(e.symbolModifier1.options.length > 90);
    assert.ok(e.symbolModifier1.options.some(option => option.value === '100'));
    e.symbolModifier1.value = '100';
    e.symbolModifier1.dispatch('change');
    assert.equal(e.symbolSidc.value.length, 30);
    assert.equal(e.symbolSidc.value[20], '1');
    e.symbolModifier2.value = '101';
    e.symbolModifier2.dispatch('change');
    assert.equal(e.symbolSidc.value.slice(18, 22), '0111');
    e.symbolModifier2.value = '000';
    e.symbolModifier2.dispatch('change');
    e.symbolModifier1.value = '000';
    e.symbolModifier1.dispatch('change');
    e.symbolSidc.value = '13031000141211000000';
    e.symbolSidc.dispatch('input');
    e['symbol-uniqueDesignation'].value = '2 Btl';
    e['symbol-uniqueDesignation'].dispatch('input');
    e.symbolName.value = 'Meu modelo';
    e.symbolSave.dispatch('click');
    const key = 'planmilt.military-symbols.v1:/plan/';
    const saved = JSON.parse(fixture.values.get(key));
    assert.equal(saved[0].config.options.uniqueDesignation, '2 Btl');
    assert.equal(saved[0].name, 'Meu modelo');
    e['symbol-uniqueDesignation'].value = 'Outro';
    e['symbol-uniqueDesignation'].dispatch('input');
    e.symbolLibrary.value = saved[0].id;
    e.symbolLoad.dispatch('click');
    assert.equal(e['symbol-uniqueDesignation'].value, '2 Btl');
    e.symbolSidc.value = '123';
    assert.equal(fixture.active().preConfirm(), false);
    assert.match(fixture.active().validation, /SIDC/);
    e.symbolLoad.dispatch('click');
    const result = fixture.active().preConfirm();
    assert.equal(result.config.options.uniqueDesignation, '2 Btl');
    fixture.active().finish({ isConfirmed: true, value: result });
    assert.equal((await pending).config.sidc, '13031000141211000000');
    e.symbolLibrary.value = saved[0].id;
    e.symbolDelete.dispatch('click');
    assert.deepEqual(JSON.parse(fixture.values.get(key)), []);
});

test('storage errors are visible and do not prevent creating symbols', async () => {
    const fixture = setup();
    fixture.failStorage();
    const pending = fixture.symbols.open();
    assert.match(fixture.elements.symbolStorageError.textContent, /Não foi possível/);
    fixture.elements.symbolName.value = 'teste';
    fixture.elements.symbolSave.dispatch('click');
    assert.match(fixture.elements.symbolStorageError.textContent, /Não foi possível salvar/);
    const result = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: result });
    assert.match((await pending).iconUrl, /^data:image/);
});

test('editing updates metadata and icon while cancel leaves marker untouched', async () => {
    const fixture = setup();
    const data = fixture.symbols.render({ sidc: '13031000141211000000', options: {} });
    const layer = { feature: { properties: { militarySymbol: data, iconUrl: data.iconUrl } }, setIcon(icon) { this.icon = icon; } };
    const leaflet = { icon: options => ({ options }) };
    let pending = fixture.symbols.edit(layer, leaflet);
    fixture.active().finish({ isConfirmed: false });
    await pending;
    assert.equal(layer.icon, undefined);
    pending = fixture.symbols.edit(layer, leaflet);
    fixture.elements['symbol-uniqueDesignation'].value = 'Bravo';
    fixture.elements['symbol-uniqueDesignation'].dispatch('input');
    const changed = fixture.active().preConfirm();
    fixture.active().finish({ isConfirmed: true, value: changed });
    await pending;
    assert.equal(layer.feature.properties.militarySymbol.config.options.uniqueDesignation, 'Bravo');
    assert.equal(layer.icon.options.iconUrl, layer.feature.properties.iconUrl);
    assert.ok(layer.icon.options.iconSize[0] > 0);
});
