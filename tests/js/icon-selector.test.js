const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
global.document = {
    createElement(tagName) {
        return new FakeElement(tagName);
    }
};

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.dataset = {};
        this.style = {};
        this.listeners = new Map();
        this.textContent = '';
    }

    set innerHTML(value) {
        this.html = value;
        this.children = [];
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    addEventListener(eventName, listener) {
        this.listeners.set(eventName, listener);
    }

    click() {
        this.listeners.get('click')?.call(this, { target: this });
    }
}

require('../../js/features/icon-selector.js');

test('the create calunga button shares the selector button styles on desktop and mobile', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../css/app.css'), 'utf8');
    assert.match(css, /#iconSelectorToggle,\s*#createMilitarySymbol\s*\{[^}]*background-color:\s*#007bff/s);
    assert.match(css, /#iconSelectorToggle:hover,\s*#createMilitarySymbol:hover\s*\{[^}]*#0056b3/s);
    assert.match(css, /#iconSelectorToggle,\s*#createMilitarySymbol\s*\{[^}]*font-size:\s*12px/s);
});

test('icon selector loads paths and exposes the selected Leaflet icon', async () => {
    const container = new FakeElement('div');
    const preview = new FakeElement('img');
    const iconOptions = [];
    const apiClient = {
        async getJson(url) {
            assert.equal(url, 'symbols/icons.php');
            return ['symbols/friend/alpha.svg', 'symbols/c2/bravo.svg'];
        }
    };
    const leaflet = {
        icon(options) {
            iconOptions.push(options);
            return { options };
        }
    };
    const selector = window.PlanMilT.iconSelector.attach({
        container,
        preview,
        leaflet,
        apiClient
    });

    assert.equal(selector.getSelectedIconKey(), 'null');
    assert.equal(selector.getSelectedIcon(), null);

    await selector.load();

    assert.deepEqual(iconOptions[0], {
        iconUrl: 'symbols/friend/alpha.svg',
        iconSize: [40, 40],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
    });

    const toggleButton = container.children[0];
    const selectorContent = container.children[1];
    const folderList = selectorContent.children[0];
    const iconList = selectorContent.children[1];
    assert.equal(folderList.children.length, 3);

    toggleButton.click();
    assert.equal(selectorContent.style.display, 'block');
    folderList.children[2].click();

    const selectedImage = iconList.children[0].children[0];
    selectedImage.click();

    assert.equal(selector.getSelectedIconKey(), 'c2/bravo');
    assert.equal(selector.getSelectedIcon().options.iconUrl, 'symbols/c2/bravo.svg');
    assert.equal(preview.src, 'symbols/c2/bravo.svg');
    assert.equal(preview.style.display, 'inline');
    assert.equal(selectorContent.style.display, 'none');
    assert.equal(toggleButton.textContent, 'Ícone selecionado: ');
});

test('a generated calunga can be selected without removing existing icons', async () => {
    const container = new FakeElement('div');
    const preview = new FakeElement('img');
    const leaflet = { icon: options => ({ options }) };
    window.PlanMilT.militarySymbols = { createIcon: (data, L) => L.icon({ iconUrl: data.iconUrl }) };
    const selector = window.PlanMilT.iconSelector.attach({
        container, preview, leaflet,
        apiClient: { getJson: async () => ['symbols/friend/alpha.svg'] }
    });
    await selector.load();
    const symbol = { iconUrl: 'data:image/svg+xml,generated', config: { sidc: 'test' } };
    selector.selectMilitarySymbol(symbol);
    assert.equal(selector.getSelectedIcon().militarySymbol, symbol);
    assert.equal(preview.src, symbol.iconUrl);
    container.children[1].children[0].children[1].click();
    container.children[1].children[1].children[0].children[0].click();
    assert.equal(selector.getSelectedIcon().options.iconUrl, 'symbols/friend/alpha.svg');
});

test('generated icon tray in the selector selects a saved symbol', async () => {
    const container = new FakeElement('div');
    const preview = new FakeElement('img');
    const symbol = { iconUrl: 'data:image/svg+xml,recent', config: { sidc: 'test' } };
    window.PlanMilT.militarySymbols = {
        createIcon: (data, L) => L.icon({ iconUrl: data.iconUrl }),
        renderRecentTray(tray, onSelect) {
            const button = new FakeElement('button');
            button.addEventListener('click', () => onSelect(symbol));
            tray.appendChild(button);
        }
    };
    const selector = window.PlanMilT.iconSelector.attach({
        container, preview, leaflet: { icon: options => ({ options }) },
        apiClient: { getJson: async () => ['symbols/friend/alpha.svg'] }
    });
    await selector.load();
    const panel = container.children[1];
    container.children[0].click();
    panel.children[0].children[0].click();
    assert.equal(panel.children[0].children[0].textContent, 'Ícones gerados anteriormente');
    panel.children[1].children[0].children[0].click();
    assert.equal(selector.getSelectedIcon().militarySymbol, symbol);
    assert.equal(preview.src, symbol.iconUrl);
    assert.equal(panel.style.display, 'none');
});