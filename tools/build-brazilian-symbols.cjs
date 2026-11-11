/**
 * Gera uma entrada isolada e um catálogo compacto a partir dos bundles do portal.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'js/library/simbologia');
const source = fs.readFileSync(path.join(directory, 'app.820fcaaf.js'), 'utf8');
const marker = 'ha={COUNTRY_CODES:Oe,SYMBOL_SET_CODES:fe},ga=';
if (source.split(marker).length !== 2) throw new Error('Bundle do portal não reconhecido.');
const adapted = source.replace(marker,
    'ha={COUNTRY_CODES:Oe,SYMBOL_SET_CODES:fe};window.PlanMilTBrazilian={ms:Ba,extensions:xa};return;var ga=');
fs.writeFileSync(path.join(directory, 'planmilt-generator.js'),
    '/* Adaptado de app.820fcaaf.js; consulte LICENCE.txt. */\n' + adapted);

const categories = [
    ['10', 'Unidades', 'unidades'], ['11', 'Organizações civis', 'organizacoes_civis'],
    ['15', 'Equipamentos e viaturas', 'equipamentos_viaturas'], ['20', 'Instalações', 'instalacoes'],
    ['27', 'Indivíduos desembarcados', 'individuos_desembarcados'],
    ['30', 'Superfície marítima', 'maritimos_superficie'], ['35', 'Submarinos', 'submarinos'],
    ['36', 'Guerra de minas', 'guerra_minas'], ['40', 'Atividades e eventos', 'atividades_eventos'],
    ['01', 'Aeronaves', 'aeronaves'], ['02', 'Mísseis', 'misseis'], ['05', 'Meios espaciais', 'espaciais']
];
const files = fs.readdirSync(directory);
const catalog = {};
for (const [code, name, suffix] of categories) {
    const matches = files.filter(file => file.startsWith(`symbolSet-${suffix}-json.`) && file.endsWith('.js'));
    if (matches.length !== 1) throw new Error(`Catálogo não encontrado ou ambíguo: ${suffix}`);
    const context = { window: { webpackJsonp: [] } };
    vm.runInNewContext(fs.readFileSync(path.join(directory, matches[0]), 'utf8'), context, { timeout: 5000 });
    const modules = context.window.webpackJsonp[0][1];
    const ids = Object.keys(modules);
    if (ids.length !== 1) throw new Error(`Catálogo inválido: ${suffix}`);
    const module = { exports: null };
    modules[ids[0]](module);
    const data = module.exports;
    catalog[code] = {
        name,
        icons: data.icones_centrais.map(row => ({ name: row.NomeBR, sidc: row.sidcBR })),
        examples: data['Doutrina FS'].filter(row => row.Natureza && row.Entity).map(row => ({
            name: row.Natureza, sidc: row.sidcBR,
            options: {
                uniqueDesignation: String(row['Designação'] || ''),
                higherFormation: String(row.Superior || ''),
                staffComments: String(row['Informações_Adicionais'] || ''),
                specialHeadquarters: String(row.specialHeadquarters || '')
            }
        })),
        modifiers1: (data['sector 1'] || []).filter(row => row['Correspondência no Brasil']).map(row => ({
            code: String(row.Code).padStart(2, '0'), name: row['Correspondência no Brasil']
        })),
        modifiers2: (data['sector 2'] || []).filter(row => row['Correspondência no Brasil']).map(row => ({
            code: String(row.Code).padStart(2, '0'), name: row['Correspondência no Brasil']
        }))
    };
}
fs.writeFileSync(path.join(root, 'js/features/brazilian-symbol-catalog.js'),
    '/* Catálogo derivado do Portal de Simbologia Militar. Licença: js/library/simbologia/LICENCE.txt. */\n' +
    'window.PlanMilT = window.PlanMilT || {};\nwindow.PlanMilT.brazilianSymbolCatalog = ' +
    JSON.stringify(catalog, null, 2) + ';\n');
