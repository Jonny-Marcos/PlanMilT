const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../js/features/layer-management.js'), 'utf8');

test('SIG selection dialog spells out the geographic information system name', () => {
    assert.match(source, /title:\s*'Selecione o Sistema de Informação Geográfica'/);
});