window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.drawingGeometry = Object.freeze({
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