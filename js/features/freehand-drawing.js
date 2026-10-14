/**
 * @fileoverview Cria o controle Leaflet de desenho livre e converte gestos em eventos de desenho padrão.
 * @exports window.PlanMilT.freehandDrawing
 * @requires Recebe mapa, Leaflet e provedor da cor atual
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.freehandDrawing = Object.freeze({
    /**
     * Cria o controle Leaflet de desenho à mão livre e registra seus eventos.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {Object} dependencies.map - Instância Leaflet do mapa principal.
     * @param {Object} dependencies.leaflet - Namespace Leaflet usado para criar camadas e controles.
     * @param {Function} dependencies.getDefaultColor - Função que fornece a cor padrão para os desenhos.
     */
    createControl({ map, leaflet, getDefaultColor }) {
        let isDrawing = false;
        let freehandPolyline = null;
        let freehandDrawingEnabled = false;
        let freehandButton = null;

        /**
         * Atualiza o estilo visual do botão de desenho livre.
         */
        function updateButtonAppearance() {
            freehandButton.style.backgroundColor = freehandDrawingEnabled ? '#bada55' : 'white';
        }

        /**
         * Alterna a ferramenta de desenho livre e seus listeners.
         */
        function toggleDrawing() {
            const mapContainer = map.getContainer();

            if (freehandDrawingEnabled) {
                freehandDrawingEnabled = false;
                mapContainer.style.cursor = '';
                map.off('mousedown', onStartDrawing);
                map.off('mouseup', onEndDrawing);
                map.off('mousemove', onDrawing);
                leaflet.DomEvent.off(mapContainer, 'touchstart', onStartDrawing);
                leaflet.DomEvent.off(mapContainer, 'touchmove', onDrawing);
                leaflet.DomEvent.off(mapContainer, 'touchend', onEndDrawing);
            } else {
                freehandDrawingEnabled = true;
                mapContainer.style.cursor = 'crosshair';
                map.on('mousedown', onStartDrawing);
                map.on('mouseup', onEndDrawing);
                map.on('mousemove', onDrawing);
                leaflet.DomEvent.on(mapContainer, 'touchstart', onStartDrawing, { passive: false });
                leaflet.DomEvent.on(mapContainer, 'touchmove', onDrawing, { passive: false });
                leaflet.DomEvent.on(mapContainer, 'touchend', onEndDrawing, { passive: false });
            }

            updateButtonAppearance();
        }

        /**
         * Obtém a coordenada do mapa associada a um evento de mouse ou toque.
         * @param {Event} event - Valor de entrada usado durante esta operação.
         */
        function getEventLatLng(event) {
            if (event.latlng) return event.latlng;
            const touch = event.touches && event.touches[0];
            return touch ? map.mouseEventToLatLng(touch) : null;
        }

        /**
         * Inicia o traço livre e suspende interações concorrentes do mapa.
         * @param {Event} event - Valor de entrada usado durante esta operação.
         */
        function onStartDrawing(event) {
            if (!freehandDrawingEnabled) return;

            event.preventDefault();
            isDrawing = true;
            freehandPolyline = leaflet.polyline([], { color: getDefaultColor() });

            const latLng = getEventLatLng(event);
            if (latLng) freehandPolyline.addLatLng(latLng);

            map.addLayer(freehandPolyline);
            map.dragging.disable();
            map.doubleClickZoom.disable();

            if (event.type === 'mousedown') {
                leaflet.DomEvent.on(map.getContainer(), 'mouseleave', onEndDrawing);
            }
        }

        /**
         * Acrescenta posições ao traço livre enquanto o usuário desenha.
         * @param {Event} event - Valor de entrada usado durante esta operação.
         */
        function onDrawing(event) {
            if (!isDrawing) return;

            event.preventDefault();
            const latLng = getEventLatLng(event);
            if (latLng) freehandPolyline.addLatLng(latLng);
        }

        /**
         * Finaliza o traço e emite um evento de desenho Leaflet.
         * @param {Event} event - Valor de entrada usado durante esta operação.
         */
        function onEndDrawing(event) {
            if (!isDrawing) return;

            event.preventDefault();
            isDrawing = false;
            map.dragging.enable();
            map.doubleClickZoom.enable();

            if (event.type === 'mouseup') {
                leaflet.DomEvent.off(map.getContainer(), 'mouseleave', onEndDrawing);
            }

            toggleDrawing();

            const latLngs = freehandPolyline.getLatLngs();
            if (latLngs.length > 2) {
                const firstPoint = map.latLngToLayerPoint(latLngs[0]);
                const lastPoint = map.latLngToLayerPoint(latLngs[latLngs.length - 1]);

                if (firstPoint.distanceTo(lastPoint) <= 15) {
                    latLngs.push(latLngs[0]);
                    const polygon = leaflet.polygon(latLngs, { color: getDefaultColor() });
                    map.removeLayer(freehandPolyline);
                    setTimeout(() => {
                        map.fire(leaflet.Draw.Event.CREATED, {
                            layerType: 'polygon',
                            layer: polygon
                        });
                    }, 0);
                    return;
                }
            }

            setTimeout(() => {
                map.fire(leaflet.Draw.Event.CREATED, {
                    layerType: 'polyline',
                    layer: freehandPolyline
                });
            }, 0);
        }

        map.getContainer().addEventListener('touchstart', event => {
            if (freehandDrawingEnabled) event.preventDefault();
        }, { passive: false });

        const FreehandControl = leaflet.Control.extend({
            options: {
                position: 'topleft'
            },
            /**
             * Cria e devolve o elemento DOM do controle de desenho livre.
             * @returns {HTMLElement} Elemento Leaflet que ativa o desenho livre.
             */
            onAdd() {
                freehandButton = leaflet.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom leaflet-control-freehand');
                freehandButton.innerHTML = '<i class="fas fa-pencil-alt"></i>';
                freehandButton.title = 'Desenho à mão livre';
                freehandButton.onclick = () => toggleDrawing();
                return freehandButton;
            }
        });

        return new FreehandControl();
    }
});