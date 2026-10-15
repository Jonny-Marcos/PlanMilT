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
    assert.match(documentSource, /app\.css\?v=20261015-catalog-inline-styles/);
    assert.match(source, /checkbox\.type = 'checkbox'/);
    assert.match(source, /selectedLayers\.set\(key, layer\)/);
    assert.match(source, /result\.value\.forEach\(layer =>/);
    assert.doesNotMatch(source, /var layerRegistry\s*=\s*\{\}/);
    assert.match(source, /php\/endpoints\/map-layer-catalog\.php/);
    assert.match(source, /addWMSLayerToMap\(/);
});