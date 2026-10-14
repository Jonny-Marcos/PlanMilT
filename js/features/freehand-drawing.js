window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.freehandDrawing = Object.freeze({
    createControl({ map, leaflet, getDefaultColor }) {
        let isDrawing = false;
        let freehandPolyline = null;
        let freehandDrawingEnabled = false;
        let freehandButton = null;

        function updateButtonAppearance() {
            freehandButton.style.backgroundColor = freehandDrawingEnabled ? '#bada55' : 'white';
        }

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

        function getEventLatLng(event) {
            if (event.latlng) return event.latlng;
            const touch = event.touches && event.touches[0];
            return touch ? map.mouseEventToLatLng(touch) : null;
        }

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

        function onDrawing(event) {
            if (!isDrawing) return;

            event.preventDefault();
            const latLng = getEventLatLng(event);
            if (latLng) freehandPolyline.addLatLng(latLng);
        }

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