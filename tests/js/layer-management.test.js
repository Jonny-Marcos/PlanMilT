const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/layer-management.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../../css/app.css'), 'utf8');
const documentSource = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

test('layer catalog fetches only the selected WMS and keeps global recommendations local', () => {
    assert.match(source, /Carregando catálogo de camadas/);
    assert.match(source, /Buscar camadas/);
    assert.match(source, /layerCatalogService/);
    assert.match(source, /mapLayers\.getWMSLayers\(serviceInfo\.url/);
    assert.match(source, /renderLayers\(filtered, message\)/);
    assert.match(source, /LAYER_CATALOG_STYLES[\s\S]*?\.layer-catalog-result\{[^}]*border-bottom:1px solid/);
    assert.match(source, /Ano \$\{getLayerYear\(layer\)\}/);
    assert.match(source, /serviceSelect\.addEventListener\('change', \(\) => \{\s*loadSelectedService\(\)/);
    assert.match(styles, /#layerCatalogPicker #layerCatalogResults \.layer-catalog-result\s*\{[\s\S]*?border-bottom: 1px solid/);
    assert.match(styles, /#layerCatalogPicker #layerCatalogResults \.layer-catalog-result > input\[type="checkbox"\]/);
    assert.match(styles, /#tacticalGraphicPicker \.tactical-graphic-result-content\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) 48px/);
    assert.match(styles, /#tacticalGraphicPicker \.tactical-graphic-result-preview svg\s*\{[\s\S]*?max-width: 46px !important/);
    assert.match(documentSource, /app\.css\?v=20261112-compact-map-controls/);
    assert.match(documentSource, /radio-planning\.js\?v=20261130-default-marker/);
    assert.match(documentSource, /coverage-image\.js\?v=20261116-coverage-popup/);
    assert.match(documentSource, /task-parameters\.js\?v=20261127-icon-tray/);
    assert.match(documentSource, /task-sequence-editor\.js\?v=20261111-propagation-scenarios/);
    assert.match(documentSource, /task-radio-links\.js\?v=20261016-antenna-height/);
    assert.match(documentSource, /task-radio-operations\.js\?v=20261111-propagation-scenarios/);
    assert.match(documentSource, /task-execution\.js\?v=20261113-auto-download/);
    for (const script of ['elevation-tools', 'kmz-import', 'tactical-graphics']) {
        assert.ok(documentSource.includes(`js/features/${script}.js?v=20261112-session`));
    }
    for (const script of ['icon-selector', 'radio-planning', 'shared-layers', 'drawing-loading', 'layer-management', 'local-session']) {
        assert.ok(documentSource.includes(`js/features/${script}.js?v=20261130-default-marker`));
    }
    assert.ok(documentSource.includes('js/features/drawing-storage.js?v=20261112-save-dialog'));
    for (const script of ['map-tools']) {
        assert.ok(documentSource.includes(`js/features/${script}.js?v=20261112-tactical-images`));
    }
    assert.ok(documentSource.includes('js/features/kmz-export.js?v=20261112-drawing-patterns'));
    for (const script of ['drawing-patterns', 'kmz-tactical-images']) {
        assert.ok(documentSource.includes(`js/features/${script}.js?v=20261129-area-patterns`));
        if (script !== 'drawing-patterns') {
            assert.ok(documentSource.indexOf('js/features/drawing-patterns.js') < documentSource.indexOf(`js/features/${script}.js`));
        }
        assert.ok(documentSource.includes('js/features/main.js?v=20261112-suggestions'));
        assert.ok(documentSource.includes('js/features/map-3d.js?v=20261112-mobile-controls'));
        assert.ok(documentSource.includes('js/features/map-3d-texture.js?v=20261112-coverage'));
        assert.ok(documentSource.indexOf('js/features/drawing-patterns.js') < documentSource.indexOf('js/features/main.js'));
    }
    assert.ok(documentSource.includes('js/features/help-and-planning.js?v=20261112-suggestions'));
    assert.ok(documentSource.includes('js/features/tactical-graphics-catalog.js?v=20261112-coordination-point'));
    assert.ok(documentSource.includes('js/features/local-history.js?v=20261112-history'));
    assert.ok(documentSource.includes('js/features/military-symbols.js?v=20261128-symbol-search'));
    assert.ok(documentSource.includes('js/features/brazilian-symbol-catalog.js?v=20261121-brasil'));
    assert.ok(documentSource.indexOf('chunk-vendors.4e5d8119.js') < documentSource.indexOf('planmilt-generator.js'));
    assert.ok(documentSource.indexOf('brazilian-symbol-catalog.js') < documentSource.indexOf('military-symbols.js'));
    for (const script of ['welcome']) {
        assert.ok(documentSource.includes(`js/features/${script}.js?v=20261118-help`));
    }
    for (const consumer of ['drawing-storage', 'drawing-loading', 'help-and-planning']) {
        assert.ok(documentSource.indexOf('js/features/welcome.js') < documentSource.indexOf(`js/features/${consumer}.js`));
    }
    assert.ok(documentSource.indexOf('js/features/local-history.js') < documentSource.indexOf('js/features/tactical-graphics.js'));
    assert.ok(documentSource.indexOf('js/features/kmz-tactical-images.js') < documentSource.indexOf('js/features/kmz-export.js'));
    assert.match(fs.readFileSync(path.join(__dirname, '../../js/features/tactical-graphics.js'), 'utf8'),
        /PICKER_STYLES[\s\S]*?#tacticalGraphicPicker \.tactical-graphic-result-preview svg/);
    assert.match(source, /Carregando dados/);
    assert.match(source, /createBoundaryLabelIcon/);
    assert.match(source, /<summary>Busca avançada<\/summary>/);
    assert.match(source, /layerCatalogAdvancedService/);
    assert.match(source, /layerCatalogAdvancedCategory/);
    assert.match(source, /layerCatalogAdvancedYear/);
    assert.match(source, /const updateAdvancedFilters = layers =>/);
    assert.match(source, /updateAdvancedFilters\(layers\)/);
    assert.match(source, /categorySelect\.value = 'all'/);
    assert.doesNotMatch(source, /categorySelect\.value = firstCategory\.code/);
    assert.match(source, /params\.set\('service_id', advancedServiceSelect\.value\)/);
    assert.match(source, /params\.set\('category_code', advancedCategorySelect\.value\)/);
    assert.match(source, /params\.set\('year', advancedYearSelect\.value\)/);
    assert.doesNotMatch(source, /Até 10 por categoria/);
    assert.match(source, /titleCharacters\.length > 25/);
    assert.match(source, /checkbox\.type = 'checkbox'/);
    assert.match(source, /selectedLayers\.set\(key, layer\)/);
    assert.match(source, /result\.value\.forEach\(layer =>/);
    assert.doesNotMatch(source, /var layerRegistry\s*=\s*\{\}/);
    assert.match(source, /php\/endpoints\/map-layer-catalog\.php/);
    assert.match(source, /addWMSLayerToMap\(/);
});

test('catalog opens with recent layers and retains category recommendations', async () => {
    class Element {
        constructor() { this.children = []; this.listeners = {}; this.value = ''; this.classList = { toggle() {}, add() {} }; }
        appendChild(child) { this.children.push(child); }
        append(...children) { this.children.push(...children); }
        replaceChildren() { this.children = []; }
        setAttribute() {}
        addEventListener(name, callback) { this.listeners[name] = callback; }
    }
    const ids = ['layerCatalogCategory', 'layerCatalogService', 'layerCatalogSearch', 'layerCatalogAdvanced',
        'layerCatalogAdvancedService', 'layerCatalogAdvancedCategory', 'layerCatalogAdvancedYear',
        'layerCatalogResults', 'layerCatalogStatus', 'layerCatalogSelection'];
    const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
    const filter = new Element();
    const popup = { classList: { add() {} }, querySelector(selector) {
        return selector === '.layer-catalog-filters' ? filter : elements[selector.slice(1)];
    } };
    const recent = { serviceId: 1, layerName: 'recent', title: 'Recente', categoryCode: '',
        categoryName: '', latestYear: 0 };
    const recommended = { serviceId: 1, layerName: 'recommended', title: 'Recomendada',
        serviceName: 'SIG', serviceUrl: '/wms' };
    const added = [];
    const recorded = [];
    let options;
    let resolveModal;
    const Swal = {
        fire(settings) {
            if (settings.title !== 'Adicionar camada') return Promise.resolve({});
            options = settings;
            settings.didOpen();
            return new Promise(resolve => { resolveModal = resolve; });
        },
        close() {},
        getPopup: () => popup,
        getConfirmButton: () => ({}),
        showValidationMessage() {}
    };
    const history = { layers: () => [recent], recordLayers: layers => recorded.push(...layers) };
    const start = source.indexOf('function showLayerCatalog()');
    const end = source.indexOf("document.getElementById('addLayerButton')", start);
    const context = {
        Swal, LAYER_CATALOG_STYLES: '', URLSearchParams, setTimeout, clearTimeout, console,
        document: { createElement: () => new Element() },
        window: { PlanMilT: { localHistory: history, apiClient: { getJson: async () => ({
            categories: [{ code: 'cat', name: 'Categoria', layers: [recommended] }],
            services: [{ id: 1, name: 'SIG atualizado', url: '/updated-wms' }]
        }) } } },
        layerRegistry: {}, addWMSLayerToMap: (...args) => added.push(args)
    };
    vm.runInNewContext(source.slice(start, end), context);
    context.showLayerCatalog();
    await new Promise(resolve => setImmediate(resolve));
    const results = elements.layerCatalogResults;
    assert.equal(results.children.length, 1);
    assert.equal(results.children[0].children[1].children[0].textContent, 'Recente');
    assert.match(elements.layerCatalogStatus.textContent, /Últimas camadas/);
    results.children[0].children[0].checked = true;
    results.children[0].children[0].listeners.change();
    elements.layerCatalogCategory.value = 'cat';
    elements.layerCatalogCategory.listeners.change();
    assert.equal(results.children[0].children[1].children[0].textContent, 'Recomendada');
    resolveModal({ isConfirmed: true, value: options.preConfirm() });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(added[0], ['/updated-wms', 'recent', 'Recente']);
    assert.equal(recorded[0].layerName, 'recent');
});