/**
 * @fileoverview Cria preenchimentos reutilizáveis para desenhos no mapa.
 * @exports window.PlanMilT.drawingPatterns
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.drawingPatterns = (() => {
    const caches = new WeakMap();

    /**
     * Obtém um padrão Leaflet para o mapa, tipo e cor informados.
     * @param {Object} map - Mapa Leaflet que receberá o padrão.
     * @param {Object} leaflet - Biblioteca Leaflet e plugin de padrões.
     * @param {string} type - Identificador do padrão persistido.
     * @param {string} color - Cor CSS do padrão.
     * @returns {Object} Padrão Leaflet.
     */
    function get(map, leaflet, type, color) {
        if (!['patternX', 'patternSlash', 'patternDots'].includes(type)) {
            throw new Error('Padrão de preenchimento não suportado: ' + type);
        }
        color = color || '#3388ff';
        let cache = caches.get(map);
        if (!cache) {
            cache = new Map();
            caches.set(map, cache);
        }
        const key = type + ':' + color;
        if (cache.has(key)) return cache.get(key);

        const pattern = new leaflet.Pattern({ width: 8, height: 8, patternUnits: 'userSpaceOnUse' });
        const shape = type === 'patternDots'
            ? new leaflet.PatternCircle({ x: 4, y: 4, radius: 1.2, stroke: false, fill: true, fillColor: color, fillOpacity: 1 })
            : new leaflet.PatternPath({ d: type === 'patternX' ? 'M0,0 L8,8 M8,0 L0,8' : 'M0,0 L8,8',
                stroke: true, weight: 1, color });
        pattern.addShape(shape);
        pattern.addTo(map);
        cache.set(key, pattern);
        return pattern;
    }

    return Object.freeze({ get });
})();
