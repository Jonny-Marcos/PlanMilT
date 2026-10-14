/**
 * @fileoverview Fornece cálculos geográficos puros usados ao desenhar formas no mapa.
 * @exports window.PlanMilT.drawingGeometry
 * @requires Leaflet LatLng ou objetos {lat, lng}
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.drawingGeometry = Object.freeze({
    /**
     * Gera as coordenadas de um polígono que aproxima um círculo geográfico.
     * @param {L.LatLng|{lat: number, lng: number}} center - Centro geográfico da forma ou simulação.
     * @param {number} radius - Raio da forma ou área em metros.
     * @param {number} numPoints - Número de vértices usados para aproximar a forma.
     * @returns {number[][][]} Anel de coordenadas latitude/longitude dentro do polígono.
     */
    createCirclePolygon(center, radius, numPoints = 64) {
        const coordinates = [];
        const degreesToRadians = Math.PI / 180;
        const radiansToDegrees = 180 / Math.PI;
        const earthRadius = 6378137;
        const radiusLatitude = (radius / earthRadius) * radiansToDegrees;
        const radiusLongitude = radiusLatitude / Math.cos(center.lat * degreesToRadians);

        for (let index = 0; index < numPoints; index++) {
            const angle = Math.PI * (index / (numPoints / 2));
            const longitude = center.lng + radiusLongitude * Math.cos(angle);
            const latitude = center.lat + radiusLatitude * Math.sin(angle);
            coordinates.push([latitude, longitude]);
        }

        return [coordinates];
    }
});