window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.geolocation = Object.freeze({
    attach({ map, button, leaflet, showError }) {
        let userMarker = null;
        let trackingActive = false;

        function onLocationFound(event) {
            if (userMarker) {
                map.removeLayer(userMarker);
            }

            userMarker = leaflet.marker(event.latlng).addTo(map);
        }

        function onLocationError(event) {
            showError(`Erro ao obter a localização: ${event.message}`);
        }

        function stopTracking() {
            map.stopLocate();
            map.off('locationfound', onLocationFound);
            map.off('locationerror', onLocationError);

            if (userMarker) {
                map.removeLayer(userMarker);
                userMarker = null;
            }

            trackingActive = false;
        }

        function toggleTracking() {
            if (trackingActive) {
                stopTracking();
                return;
            }

            map.on('locationfound', onLocationFound);
            map.on('locationerror', onLocationError);
            map.locate({ setView: true, maxZoom: 16, watch: true, enableHighAccuracy: true });
            trackingActive = true;
        }

        button.addEventListener('click', toggleTracking);

        return {
            stop() {
                if (trackingActive) stopTracking();
                button.removeEventListener('click', toggleTracking);
            }
        };
    }
});