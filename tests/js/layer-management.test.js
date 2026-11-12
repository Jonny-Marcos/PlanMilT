const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

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
    assert.match(documentSource, /app\.css\?v=20261123-calunga-layout/);
    assert.match(documentSource, /radio-planning\.js\?v=20261115-rx-power/);
    assert.match(documentSource, /coverage-image\.js\?v=20261116-coverage-popup/);
    assert.match(documentSource, /task-parameters\.js\?v=20261119-calungas/);
    assert.match(documentSource, /task-sequence-editor\.js\?v=20261111-propagation-scenarios/);
    assert.match(documentSource, /task-radio-links\.js\?v=20261016-antenna-height/);
    assert.match(documentSource, /task-radio-operations\.js\?v=20261111-propagation-scenarios/);
    assert.match(documentSource, /task-execution\.js\?v=20261113-auto-download/);
    for (const script of ['drawing-storage', 'elevation-tools']) {
        assert.ok(documentSource.includes(`js/features/${script}.js?v=20261117-welcome`));
    }
    for (const script of ['icon-selector', 'kmz-export', 'main', 'kmz-import', 'shared-layers', 'drawing-loading', 'layer-management', 'help-and-planning']) {
        assert.ok(documentSource.includes(`js/features/${script}.js?v=20261119-calungas`));
    }
    assert.ok(documentSource.includes('js/features/brazilian-symbol-catalog.js?v=20261121-brasil'));
    assert.ok(documentSource.includes('js/features/military-symbols.js?v=20261123-calunga-layout'));
    assert.ok(documentSource.indexOf('chunk-vendors.4e5d8119.js') < documentSource.indexOf('planmilt-generator.js'));
    assert.ok(documentSource.indexOf('brazilian-symbol-catalog.js') < documentSource.indexOf('military-symbols.js'));
    for (const script of ['welcome']) {
        assert.ok(documentSource.includes(`js/features/${script}.js?v=20261118-help`));
    }
    for (const consumer of ['drawing-storage', 'drawing-loading', 'help-and-planning']) {
        assert.ok(documentSource.indexOf('js/features/welcome.js') < documentSource.indexOf(`js/features/${consumer}.js`));
    }
    assert.match(documentSource, /tactical-graphics\.js\?v=20260617-tactical-graphic-picker/);
    assert.match(fs.readFileSync(path.join(__dirname, '../../js/features/tactical-graphics.js'), 'utf8'),
        /PICKER_STYLES[\s\S]*?#tacticalGraphicPicker \.tactical-graphic-result-preview svg/);
    assert.match(source, /Carregando dados/);
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