const assert = require('node:assert/strict');
const test = require('node:test');

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
    assert.equal(folderList.children.length, 2);

    toggleButton.click();
    assert.equal(selectorContent.style.display, 'block');
    folderList.children[1].click();

    const selectedImage = iconList.children[0].children[0];
    selectedImage.click();

    assert.equal(selector.getSelectedIconKey(), 'c2/bravo');
    assert.equal(selector.getSelectedIcon().options.iconUrl, 'symbols/c2/bravo.svg');
    assert.equal(preview.src, 'symbols/c2/bravo.svg');
    assert.equal(preview.style.display, 'inline');
    assert.equal(selectorContent.style.display, 'none');
    assert.equal(toggleButton.textContent, 'Ícone selecionado: ');
});