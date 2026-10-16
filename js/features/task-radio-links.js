/**
 * @fileoverview Verifica enlaces entre ícones usando os cálculos RF e óticos da predição.
 * @exports window.PlanMilT.taskRadioLinks
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.taskRadioLinks = Object.freeze({
    /**
     * Prepara a execução da tarefa de verificação de enlaces.
     * @param {Object} dependencies - Dependências da tarefa.
     * @param {Object} dependencies.map - Mapa Leaflet principal.
     * @param {Object} dependencies.leaflet - Namespace Leaflet.
     * @param {Object} dependencies.drawnItems - Camada de desenhos do usuário.
     * @param {Object} dependencies.planningLayer - Camada de sugestões de planejamento.
     * @param {Object} dependencies.radioPlanning - Serviço de análise RF e ótica.
     * @param {Function} dependencies.log - Registra mensagens no log do planejamento.
     */
    attach({ map, leaflet, drawnItems, planningLayer, radioPlanning, log }) {
        /**
         * Filtra ícones na área e desenha o resultado da análise de enlace entre eles.
         * @param {Object} params - Ícones, preset, distância máxima e área selecionados.
         * @returns {Promise<Object>} Quantidade de enlaces viáveis, falhos e analisados.
         */
        async function verify(params) {
            const sourceLayer = params.iconLayer === 'drawnItems'
                ? drawnItems
                : params.iconLayer === 'planningSuggestions'
                    ? planningLayer
                    : null;
            if (!sourceLayer) throw new Error('Camada de origem dos ícones inválida.');

            const selectionArea = params.area || map.getBounds();
            const sourceMarkers = [];
            const targetMarkers = [];
            sourceLayer.eachLayer(layer => {
                if (!(layer instanceof leaflet.Marker) || !layer.options.icon || !layer.options.icon.options.iconUrl) return;
                const position = layer.getLatLng();
                const isInArea = selectionArea instanceof leaflet.LatLngBounds || selectionArea instanceof leaflet.Polygon
                    ? selectionArea.contains(position)
                    : false;
                if (!isInArea) return;
                const iconUrl = layer.options.icon.options.iconUrl;
                if (iconUrl === params.iconType1) sourceMarkers.push(layer);
                if (iconUrl === params.iconType2) targetMarkers.push(layer);
            });

            const pairs = [];
            if (params.iconType1 === params.iconType2) {
                for (let i = 0; i < sourceMarkers.length; i++) {
                    for (let j = i + 1; j < sourceMarkers.length; j++) {
                        pairs.push([sourceMarkers[i], sourceMarkers[j]]);
                    }
                }
            } else {
                for (const source of sourceMarkers) {
                    for (const target of targetMarkers) {
                        pairs.push([source, target]);
                    }
                }
            }

            if (sourceMarkers.length === 0 || targetMarkers.length === 0) {
                const missingGroups = [
                    sourceMarkers.length === 0 ? 'origem' : '',
                    targetMarkers.length === 0 ? 'destino' : ''
                ].filter(Boolean).join(' e ');
                throw new Error(`Nenhum ícone do grupo de ${missingGroups} está na área visível do mapa. Confira os tipos escolhidos, a camada de origem e ajuste o mapa para enquadrar as unidades.`);
            }

            const maximumDistanceMeters = params.maxDistance * 1000;
            const candidates = pairs.filter(([source, target]) => {
                const distanceMeters = map.distance(source.getLatLng(), target.getLatLng());
                return distanceMeters > 0 && distanceMeters <= maximumDistanceMeters;
            });
            if (candidates.length === 0) {
                throw new Error('Os ícones estão visíveis, mas nenhum par está dentro da distância máxima selecionada. Aumente o alcance ou aproxime/enquadre as unidades no mapa.');
            }
            const preset = radioPlanning.getPresets().find(item => item.id === params.radioPreset);
            if (!preset) throw new Error('Preset de rádio ou visada inválido.');

            let viableCount = 0;
            for (const [source, target] of candidates) {
                const sourcePosition = source.getLatLng();
                const targetPosition = target.getLatLng();
                const result = await radioPlanning.analyzeLink(sourcePosition, targetPosition, params.radioPreset);
                const color = result.isViable ? '#00a000' : '#d00000';
                const status = result.isViable ? 'VIÁVEL' : 'FALHO';
                const signalDetails = params.radioPreset === 'optical'
                    ? `Visada: ${result.hasObstruction ? 'obstruída' : 'limpa'}`
                    : `Sinal estimado: ${result.rxPower.toFixed(2)} dBm`;
                const polyline = leaflet.polyline([sourcePosition, targetPosition], {
                    color,
                    weight: 3,
                    dashArray: '8, 5'
                }).addTo(planningLayer);
                polyline.bindPopup(
                    `<b>Verificação de enlace</b><br>Status: <strong style="color:${color}">${status}</strong>` +
                    `<br>Perfil: ${preset.label}<br>Distância: ${result.distTotalKm.toFixed(2)} km` +
                    `<br>${signalDetails}<br>Obstrução de Fresnel: ${result.hasObstruction ? 'Sim' : 'Não'}`
                );
                polyline.feature = {
                    type: 'Feature',
                    properties: {
                        folderName: 'Sugestão de Planejamento',
                        name: `Enlace ${status}`,
                        description: `${preset.label}; ${result.distTotalKm.toFixed(2)} km; ${signalDetails}`,
                        color
                    }
                };
                if (result.isViable) viableCount++;
            }

            const failedCount = candidates.length - viableCount;
            log(`Verificação concluída: ${candidates.length} enlaces analisados, ${viableCount} viáveis e ${failedCount} falhos.`);
            return { analyzedCount: candidates.length, viableCount, failedCount };
        }

        return Object.freeze({ verify });
    }
});
