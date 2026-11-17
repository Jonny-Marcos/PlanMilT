const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');

class Element {
    constructor(tagName = '') {
        this.tagName = tagName;
        this.children = [];
        this.listeners = {};
        this.value = '';
        this.textContent = '';
        this.attributes = {};
    }

    set innerHTML(html) {
        for (const match of html.matchAll(/<([a-z]+)[^>]*id="([^"]+)"[^>]*>/gi)) {
            this.elements.set(`#${match[2]}`, new Element(match[1].toLowerCase()));
        }
        for (const [selector, tag] of [
            ['[data-preview]', 'img'], ['[data-error]', 'p'],
            ['[data-confirm]', 'button'], ['[data-cancel]', 'button']
        ]) {
            this.elements.set(selector, new Element(tag));
        }
    }

    appendChild(child) { this.children.push(child); }
    replaceChildren() { this.children = []; this.value = ''; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    remove() { this.removed = true; }
    showModal() { this.open = true; }
    close() {
        this.open = false;
        this.listeners.close?.();
    }
    querySelector(selector) { return this.elements.get(selector); }
    dispatch(name) { this.listeners[name]?.({ target: this }); }
}

function setup() {
    const dialogs = [];
    const body = { appendChild(dialog) { dialogs.push(dialog); } };
    const document = {
        body,
        createElement(tagName) {
            const element = new Element(tagName);
            if (tagName === 'dialog') element.elements = new Map();
            return element;
        }
    };
    const window = {
        PlanMilT: {},
        addEventListener() {},
        removeEventListener() {},
        navigator: { userAgent: 'node' }
    };
    window.window = window;
    const context = vm.createContext({
        window, document, navigator: window.navigator, console, URL,
        setTimeout, clearTimeout, TextEncoder, TextDecoder
    });
    const source = fs.readFileSync(
        path.join(root, 'js/library/planmilt-symbols/planmilt-symbols.js'), 'utf8'
    );
    vm.runInContext(source, context);
    return { library: window.PlanMilTSymbols, dialogs };
}

test('standalone creator returns a configured rendered symbol without app dependencies', async () => {
    const { library, dialogs } = setup();
    const pending = library.openSymbolCreator();
    const dialog = dialogs[0];

    dialog.querySelector('#creator-affiliation').value = '6';
    dialog.querySelector('#creator-affiliation').dispatch('change');
    dialog.querySelector('#creator-uniqueDesignation').value = '1 Btl';
    dialog.querySelector('#creator-uniqueDesignation').dispatch('input');
    dialog.querySelector('[data-confirm]').dispatch('click');

    const result = await pending;
    assert.equal(result.config.sidc.slice(3, 4), '6');
    assert.equal(result.config.options.uniqueDesignation, '1 Btl');
    assert.match(result.svg, /<svg/);
    assert.match(result.dataUrl, /^data:image\/svg/);
    assert.equal(dialog.removed, true);
});

test('standalone creator resolves null when cancelled', async () => {
    const { library, dialogs } = setup();
    const pending = library.openSymbolCreator();
    dialogs[0].querySelector('[data-cancel]').dispatch('click');

    assert.equal(await pending, null);
});
