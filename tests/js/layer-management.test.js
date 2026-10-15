const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/layer-management.js'), 'utf8');

test('layer catalog loads recommendations and exposes global text search', () => {
    assert.match(source, /Carregando catálogo de camadas/);
    assert.match(source, /Buscar no catálogo completo/);
    assert.match(source, /php\/endpoints\/map-layer-catalog\.php/);
    assert.match(source, /addWMSLayerToMap\(/);
});