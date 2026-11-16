/**
 * @fileoverview API pública da biblioteca estática de símbolos PlanMilT.
 */
const brazilianCatalog = window.PlanMilT.brazilianSymbolCatalog;
const tacticalCatalog = window.PlanMilT.tacticalGraphicsCatalog;
const brazilianGenerator = window.PlanMilTBrazilian;
const milsymbol = milsymbolImport.default || milsymbolImport;

/**
 * Retorna as entradas do catálogo brasileiro, opcionalmente filtradas por categoria.
 * @param {{category?: string, includeExamples?: boolean}} [filters] Filtros do catálogo.
 * @returns {Array<Object>} Símbolos e exemplos doutrinários.
 */
function listSymbols({ category, includeExamples = true } = {}) {
    const categoryCodes = category ? [String(category)] : Object.keys(brazilianCatalog);
    return categoryCodes.flatMap(categoryCode => {
        const group = brazilianCatalog[categoryCode];
        if (!group) return [];
        return [
            ...group.icons.map(item => ({ ...item, category: categoryCode, categoryName: group.name, kind: 'icon' })),
            ...(includeExamples ? group.examples.map(item => ({
                ...item, category: categoryCode, categoryName: group.name, kind: 'example'
            })) : [])
        ];
    });
}

/**
 * Procura uma entrada brasileira pelo SIDC.
 * @param {string} sidc SIDC completo.
 * @returns {Object|null} Entrada encontrada.
 */
function findSymbol(sidc) {
    return listSymbols().find(item => item.sidc === sidc) || null;
}

/**
 * Renderiza SIDC padrão com MilSymbols ou extensão brasileira com o gerador do portal.
 * @param {string|{sidc: string, options?: Object}} input SIDC ou configuração do símbolo.
 * @param {Object} [options] Opções de apresentação e amplificadores textuais.
 * @returns {Object} Instância do renderizador e dados para exibição.
 */
function renderSymbol(input, options = {}) {
    const config = typeof input === 'string' ? { sidc: input, options } : input;
    if (!config || typeof config.sidc !== 'string' || !/^(?:\d{20}|\d{30})$/.test(config.sidc)) {
        throw new Error('Informe um SIDC numérico de 20 ou 30 dígitos.');
    }
    if (!config.options || typeof config.options !== 'object' || Array.isArray(config.options)) {
        throw new Error('As opções do símbolo devem ser um objeto.');
    }

    let symbol;
    let engine;
    if (config.sidc.length === 30) {
        const category = brazilianCatalog[config.sidc.slice(4, 6)];
        if (!category || config.sidc.slice(20, 23) !== '076') {
            throw new Error('Informe uma extensão brasileira de SIDC conhecida.');
        }
        const bits = Number(config.sidc.slice(23));
        if (bits >= 2 ** 19) throw new Error('Extensão brasileira de SIDC inválida.');
        const extensions = brazilianGenerator.extensions[config.sidc.slice(4, 6)];
        for (const [name, value] of [
            ['ModificadorTransversal', (bits >> 10) & 7],
            ['Modificador1', (bits >> 5) & 31],
            ['Modificador2', bits & 31]
        ]) {
            if (value && (!extensions || !extensions[name] || !extensions[name][value])) {
                throw new Error('Modificador brasileiro não reconhecido para esta categoria.');
            }
        }
        const entityExtension = sidc => sidc.length === 30 ? (Number(sidc.slice(23)) >> 14) & 31 : 0;
        const knownEntity = [...category.icons, ...category.examples].some(item =>
            item.sidc.slice(10, 16) === config.sidc.slice(10, 16)
            && entityExtension(item.sidc) === entityExtension(config.sidc)
        );
        symbol = new brazilianGenerator.ms.Symbol(config.sidc, { size: 35, ...config.options });
        if (!symbol.isValid() && !knownEntity) {
            throw new Error('SIDC ou combinação de modificadores não reconhecida.');
        }
        engine = 'simbologia.eb.mil.br';
    } else {
        symbol = new milsymbol.Symbol(config.sidc, config.options);
        if (!symbol.isValid()) throw new Error('SIDC não reconhecido pelo MilSymbols.');
        engine = 'milsymbol';
    }

    return {
        sidc: config.sidc,
        engine,
        symbol,
        svg: symbol.asSVG(),
        dataUrl: symbol.toDataURL(),
        size: symbol.getSize(),
        anchor: symbol.getAnchor()
    };
}

/**
 * Gera o gráfico próprio Ponto de coordenação a partir do centro e do diâmetro.
 * @param {Object} feature Feição GeoJSON do ponto.
 * @returns {{graphic: Object, labels: Object}} Geometrias do gráfico e rótulo.
 */
function renderCoordinationPoint(feature) {
    const [longitude, latitude] = feature.geometry.coordinates;
    const diameter = feature.properties.tacticalGraphic.diameter;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 85
        || !Number.isFinite(diameter) || diameter < 1 || diameter > 100000) {
        throw new Error('Informe coordenadas válidas e diâmetro entre 1 e 100.000 metros.');
    }

    const radius = diameter / 2;
    const angularDistance = radius / 6371008.8;
    const latitudeRadians = latitude * Math.PI / 180;
    const longitudeRadians = longitude * Math.PI / 180;
    const ring = Array.from({ length: 65 }, (_, index) => {
        const bearing = index * 2 * Math.PI / 64;
        const targetLatitude = Math.asin(
            Math.sin(latitudeRadians) * Math.cos(angularDistance)
            + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing)
        );
        const targetLongitude = longitudeRadians + Math.atan2(
            Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
            Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(targetLatitude)
        );
        return [targetLongitude * 180 / Math.PI, targetLatitude * 180 / Math.PI];
    });
    if (ring.some(([lng, lat]) => Math.abs(lng) > 180 || Math.abs(lat) > 85)) {
        throw new Error('O ponto de coordenação excede os limites geográficos suportados.');
    }

    const start = 8;
    const circle = Array.from({ length: 65 }, (_, index) => ring[(start + index) % 64]);
    const coordinates = [
        ...circle,
        ring[40],
        ...Array.from({ length: 17 }, (_, index) => ring[(40 + index) % 64]),
        ring[24]
    ];
    return {
        graphic: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates },
            properties: { ...feature.properties, role: 'graphic' }
        },
        labels: {
            type: 'Feature',
            geometry: { type: 'MultiPoint', coordinates: [[longitude, latitude]] },
            properties: { tacticalGraphic: feature.properties.tacticalGraphic, role: 'label' }
        }
    };
}

/**
 * Renderiza um gráfico tático incluído na biblioteca ou o Ponto de coordenação.
 * @param {Object} feature Feição GeoJSON com propriedades tacticalGraphic.
 * @returns {Object} Feições GeoJSON do gráfico renderizado.
 */
function renderTacticalGraphic(feature) {
    const name = feature?.properties?.tacticalGraphic?.name;
    if (name === 'CoordinationPoint') return renderCoordinationPoint(feature);
    return tacticalGraphics.renderTacticalGraphic(feature);
}

window.PlanMilTSymbols = Object.freeze({
    version: '1.0.0',
    catalog: brazilianCatalog,
    milsymbol,
    listSymbols,
    findSymbol,
    renderSymbol,
    listTacticalGraphics: frequentNames => tacticalCatalog.buildSections(tacticalGraphics, frequentNames),
    renderTacticalGraphic
});
