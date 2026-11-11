/**
 * @fileoverview Serializa grupos Leaflet sem expandir coleções grandes como argumentos de função.
 * @exports window.PlanMilT.geoJsonSerialization
 * @requires Grupos e camadas Leaflet com toGeoJSON
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.geoJsonSerialization = Object.freeze({
    /**
     * Converte um grupo em FeatureCollection, preservando a ordem e geometrias especiais.
     * @param {Object} group - Grupo Leaflet a serializar.
     * @param {number|false} [precision] - Precisão opcional aceita pelo Leaflet.
     * @returns {Object} Coleção de feições GeoJSON.
     */
    toFeatureCollection(group, precision) {
        const features = [];
        const stack = [group];
        while (stack.length > 0) {
            const layer = stack.pop();
            if (!layer || typeof layer.toGeoJSON !== 'function') continue;
            const geometryType = layer.feature && layer.feature.geometry && layer.feature.geometry.type;
            if (typeof layer.eachLayer === 'function' && geometryType !== 'MultiPoint' && geometryType !== 'GeometryCollection') {
                const children = [];
                layer.eachLayer(child => children.push(child));
                for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]);
                continue;
            }
            const result = layer.toGeoJSON(precision);
            if (result.type === 'FeatureCollection') {
                for (const feature of result.features) features.push(feature);
            } else if (result.type === 'Feature') {
                features.push(result);
            } else {
                features.push({ type: 'Feature', properties: {}, geometry: result });
            }
        }
        return { type: 'FeatureCollection', features };
    }
});
