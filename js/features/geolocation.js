/**
 * @fileoverview Gerencia início e parada do rastreamento de geolocalização e a representação da posição no mapa.
 * @exports window.PlanMilT.geolocation
 * @requires Geolocation API do navegador, mapa e Leaflet
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.geolocation = Object.freeze({
    /**
     * Conecta o controle de localização ao mapa e devolve operações de rastreamento.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {Object} dependencies.map - Instância Leaflet do mapa principal.
     * @param {HTMLElement} dependencies.button - Botão DOM que aciona o recurso.
     * @param {Object} dependencies.leaflet - Namespace Leaflet usado para criar camadas e controles.
     * @param {Function} dependencies.showError - Callback para apresentar erros de geolocalização.
     */
    attach({ map, button, leaflet, showError }) {
        let userMarker = null;
        let trackingActive = false;

        /**
         * Atualiza o marcador da posição encontrada no mapa.
         * @param {Event} event - Valor de entrada usado durante esta operação.
         */
        function onLocationFound(event) {
            if (userMarker) {
                map.removeLayer(userMarker);
            }

            userMarker = leaflet.marker(event.latlng).addTo(map);
        }

        /**
         * Encaminha falhas de geolocalização ao tratamento configurado.
         * @param {Event} event - Valor de entrada usado durante esta operação.
         */
        function onLocationError(event) {
            showError(`Erro ao obter a localização: ${event.message}`);
        }

        /**
         * Desativa o rastreamento e limpa o marcador de localização.
         */
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

        /**
         * Alterna entre iniciar e encerrar o rastreamento de localização.
         */
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
            /**
             * Encerra o rastreamento e remove os listeners associados.
             */
            stop() {
                if (trackingActive) stopTracking();
                button.removeEventListener('click', toggleTracking);
            }
        };
    }
});