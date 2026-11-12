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
        this.attributes = {};
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

    setAttribute(name, value) {
        this.attributes[name] = value;
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
    const categoryList = selectorContent.children[1];
    const iconList = selectorContent.children[2];
    assert.equal(folderList.children.length, 3);

    toggleButton.click();
    assert.equal(selectorContent.style.display, 'block');
    folderList.children[1].click();
    categoryList.children.find(button => button.textContent === 'Outros').click();

    const selectedImage = iconList.children[0].children[0];
    selectedImage.click();

    assert.equal(selector.getSelectedIconKey(), 'friend/alpha');
    assert.equal(selector.getSelectedIcon().options.iconUrl, 'symbols/friend/alpha.svg');
    assert.equal(preview.src, 'symbols/friend/alpha.svg');
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
    container.children[1].children[1].children.find(button => button.textContent === 'Outros').click();
    container.children[1].children[2].children[0].children[0].click();
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
    panel.children[2].children[0].children[0].click();
    assert.equal(selector.getSelectedIcon().militarySymbol, symbol);
    assert.equal(preview.src, symbol.iconUrl);
    assert.equal(panel.style.display, 'none');
});

test('existing icons are accessible in their divisions and C2 is shared without changing paths', async () => {
    const container = new FakeElement('div');
    const directories = ['friend', 'enemy', 'c2'];
    const paths = directories.flatMap(directory =>
        fs.readdirSync(path.join(__dirname, '../../symbols', directory))
            .filter(name => name.endsWith('.svg'))
            .map(name => `symbols/${directory}/${name}`)
    );
    paths.push('symbols/friend/new-unclassified.svg');
    const selector = window.PlanMilT.iconSelector.attach({
        container, preview: new FakeElement('img'), leaflet: { icon: options => ({ options }) },
        apiClient: { getJson: async () => paths }
    });
    await selector.load();
    const [folders, categories, icons] = container.children[1].children;
    const categoryNames = ['Infantaria', 'Cavalaria', 'Artilharia', 'Engenharia', 'Logística', 'Comunicações', 'Outros'];
    const samples = {
        friend: {
            Infantaria: 'bda-inf-mtz-planejada', Cavalaria: 'rgt-cav-mec', Artilharia: 'gac-105ar',
            Engenharia: 'btl-eng-cnst', Logística: 'gpt-log', Comunicações: 'bcom'
        },
        enemy: {
            Infantaria: 'ft-blt-inf-mec', Cavalaria: 'reg-cav-mec', Artilharia: 'gac-155-AR',
            Engenharia: 'btl-eng', Logística: 'btl-log', Comunicações: 'btl-com'
        }
    };

    for (const [directory, label] of [['friend', 'Amigo'], ['enemy', 'Inimigo']]) {
        const folder = folders.children.find(button => button.textContent === label);
        folder.click();
        assert.equal(folder.attributes['aria-pressed'], 'true');
        assert.deepEqual(categories.children.map(button => button.textContent), categoryNames);
        const seen = [];
        for (const category of categories.children) {
            category.click();
            assert.equal(category.attributes['aria-pressed'], 'true');
            const images = icons.children.flatMap(item => item.children.filter(child => child.tagName === 'img'));
            const local = images.filter(image => image.dataset.optionValue.startsWith(`${directory}/`));
            const shared = images.filter(image => image.dataset.optionValue.startsWith('c2/'));
            if (category.textContent !== 'Outros') {
                assert.ok(local.length > 0, `${label}: ${category.textContent} está vazia`);
                assert.ok(local.some(image => image.alt === samples[directory][category.textContent]));
            }
            seen.push(...local.map(image => image.src));
            if (category.textContent === 'Comunicações') {
                assert.equal(shared.length, paths.filter(icon => icon.startsWith('symbols/c2/')).length);
                assert.ok(icons.children.some(item => item.textContent === 'C2 (comum)'));
                shared[0].click();
                assert.equal(selector.getSelectedIcon().options.iconUrl, shared[0].src);
                assert.equal(selector.getSelectedIconKey(), shared[0].dataset.optionValue);
                assert.ok(local.some(image => image.alt === 'cia-ge'));
                if (directory === 'enemy') {
                    for (const name of ['btl-com-ge', 'mae-confirmada', 'mae-estimada', 'mage-confirmada', 'mage-estimada', 'pel-ge']) {
                        assert.ok(local.some(image => image.alt === name), name);
                    }
                }
            }
            if (category.textContent === 'Infantaria') {
                for (const name of ['cia-ac', 'corpo-ex', ...(directory === 'enemy' ? ['pc-de'] : [])]) {
                    assert.ok(local.some(image => image.alt === name), name);
                }
            }
            if (category.textContent === 'Artilharia' && directory === 'friend') {
                assert.ok(local.some(image => image.alt === 'gaaae'));
            }
            if (category.textContent === 'Outros' && directory === 'friend') {
                assert.deepEqual(local.map(image => image.alt).sort(), [
                    'bavex', 'bcomge', 'bge', 'bia-cmdo', 'cia-ass-civ', 'cia-busc-alvos',
                    'cia-c-ap', 'cia-pe', 'de', 'esqd-avex', 'ft-bil-amv', 'gce',
                    'gp-cntr-sist', 'new-unclassified', 'pc-de-pcp-planejada'
                ].sort());
            }
            if (category.textContent === 'Outros' && directory === 'enemy') assert.equal(local.length, 0);
        }
        assert.deepEqual(seen.sort(), paths.filter(icon => icon.startsWith(`symbols/${directory}/`)).sort());
    }
});