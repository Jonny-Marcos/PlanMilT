/**
 * @fileoverview Executa análises de cobertura, rota, repetidores e comparação de presets RF/óticos.
 * @exports window.PlanMilT.taskRadioOperations
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.taskRadioOperations = Object.freeze({
    /**
     * Prepara tarefas adicionais de planejamento de rádio.
     * @param {Object} dependencies - Serviços e camadas usados nas análises.
     * @param {Object} dependencies.map - Mapa Leaflet principal.
     * @param {Object} dependencies.leaflet - Namespace Leaflet.
     * @param {Object} dependencies.turf - Operações geográficas Turf.
     * @param {Object} dependencies.drawnItems - Camada de desenhos do usuário.
     * @param {Object} dependencies.planningLayer - Camada de sugestões de planejamento.
     * @param {Object} dependencies.radioPlanning - Serviço compartilhado de análise de enlaces.
     * @param {Function} dependencies.log - Registra mensagens no log da sequência.
     */
    attach({ map, leaflet, turf, drawnItems, planningLayer, radioPlanning, log }) {
        const maxAnalyzedLinks = 150;
        const maxAnalyzedPoints = 25000;
        const maxComparedPairs = 30;

        /**
         * Resolve o nome lógico da camada para o grupo Leaflet correspondente.
         * @param {string} layerName - Identificador persistido da camada.
         * @returns {Object} Grupo de camadas Leaflet.
         */
        function getSourceLayer(layerName) {
            if (layerName === 'drawnItems') return drawnItems;
            if (layerName === 'planningSuggestions') return planningLayer;
            throw new Error('Camada de origem inválida.');
        }

        /**
         * Verifica se a coordenada pertence à área de análise.
         * @param {Object} position - Coordenada Leaflet com latitude e longitude.
         * @param {Object} area - Limites ou polígono de análise.
         * @returns {boolean} Indica se a coordenada está contida na área.
         */
        function isWithinArea(position, area) {
            if (area instanceof leaflet.LatLngBounds) return area.contains(position);
            if (area instanceof leaflet.Polygon) {
                return turf.booleanPointInPolygon(
                    turf.point([position.lng, position.lat]),
                    area.toGeoJSON()
                );
            }
            return false;
        }

        /**
         * Reúne marcadores com ícones válidos, opcionalmente limitados por uma área.
         * @param {string} layerName - Identificador lógico da camada.
         * @param {Object|null} [area=null] - Área opcional de filtro.
         * @returns {Array<Object>} Ícone, coordenada e camada de cada marcador.
         */
        function collectMarkers(layerName, area = null) {
            const markers = [];
            getSourceLayer(layerName).eachLayer(layer => {
                if (!(layer instanceof leaflet.Marker) || !layer.options.icon || !layer.options.icon.options.iconUrl) return;
                const position = layer.getLatLng();
                if (!area || isWithinArea(position, area)) {
                    markers.push({ iconUrl: layer.options.icon.options.iconUrl, position, layer });
                }
            });
            return markers;
        }

        /**
         * Forma pares distintos de ícones que respeitam o alcance máximo.
         * @param {Array<Object>} markers - Marcadores candidatos.
         * @param {string} iconType1 - Ícone de origem.
         * @param {string} iconType2 - Ícone de destino.
         * @param {number} maxDistanceKm - Distância máxima em quilômetros.
         * @returns {Array<Object>} Pares de marcadores e suas distâncias.
         */
        function collectPairs(markers, iconType1, iconType2, maxDistanceKm) {
            const sources = markers.filter(marker => marker.iconUrl === iconType1);
            const targets = markers.filter(marker => marker.iconUrl === iconType2);
            const pairs = [];
            if (iconType1 === iconType2) {
                for (let first = 0; first < sources.length; first++) {
                    for (let second = first + 1; second < sources.length; second++) {
                        const distanceKm = map.distance(sources[first].position, sources[second].position) / 1000;
                        if (distanceKm > 0 && distanceKm <= maxDistanceKm) {
                            pairs.push({ source: sources[first], target: sources[second], distanceKm });
                        }
                    }
                }
                return pairs;
            }
            for (const source of sources) {
                for (const target of targets) {
                    if (source.layer === target.layer) continue;
                    const distanceKm = map.distance(source.position, target.position) / 1000;
                    if (distanceKm > 0 && distanceKm <= maxDistanceKm) pairs.push({ source, target, distanceKm });
                }
            }
            return pairs;
        }

        /**
         * Impede requisições de elevação que excedam os limites de custo da tarefa.
         * @param {Array<Object>} links - Enlaces que serão amostrados.
         * @param {number} [limit=maxAnalyzedLinks] - Quantidade máxima de enlaces.
         * @returns {void}
         */
        function ensureLinkLimit(links, limit = maxAnalyzedLinks) {
            if (links.length === 0) throw new Error('Não há pontos ou enlaces válidos na área selecionada.');
            if (links.length > limit) {
                throw new Error(`A análise geraria ${links.length} enlaces. Reduza a área ou o número de candidatos (limite: ${limit}).`);
            }
            const estimatedPoints = links.reduce((total, link) =>
                total + Math.max(2, Math.ceil(map.distance(link.from, link.to) / 30) + 1), 0);
            if (estimatedPoints > maxAnalyzedPoints) {
                throw new Error(`A análise exigiria cerca de ${estimatedPoints} amostras de relevo. Reduza o alcance ou o número de pontos (limite: ${maxAnalyzedPoints}).`);
            }
        }

        /**
         * Desenha um marcador de resultado e associa metadados exportáveis.
         * @param {Object} position - Coordenada Leaflet do resultado.
         * @param {string} color - Cor de apresentação.
         * @param {number} radius - Raio do marcador em pixels.
         * @param {string} name - Nome mostrado no mapa.
         * @param {string} description - Texto do popup e da exportação.
         * @returns {Object} Marcador Leaflet criado.
         */
        function drawCircle(position, color, radius, name, description) {
            const marker = leaflet.circleMarker(position, {
                radius,
                color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.35
            }).addTo(planningLayer);
            marker.bindPopup(`<b>${name}</b><br>${description}`);
            marker.feature = {
                type: 'Feature',
                properties: { folderName: 'Sugestão de Planejamento', name, description, color }
            };
            return marker;
        }

        /**
         * Mapeia células estimadas sem cobertura no limite de uma área selecionada.
         * @param {Object} params - Camada, ícone das estações, preset, resolução e alcance.
         * @returns {Promise<Object>} Quantidade de células analisadas e descobertas.
         */
        async function identifyCoverageGaps(params) {
            const area = params.area || map.getBounds();
            const stations = collectMarkers(params.iconLayer).filter(marker => marker.iconUrl === params.stationIcon);
            if (stations.length === 0) {
                throw new Error('Nenhuma estação do tipo selecionado foi encontrada na camada de origem. Adicione esse marcador ou escolha outra camada e tipo de ícone.');
            }
            if (stations.length > maxAnalyzedLinks) {
                throw new Error(`Há ${stations.length} estações na camada; limite da análise: ${maxAnalyzedLinks}.`);
            }

            const bounds = area instanceof leaflet.Polygon ? area.getBounds() : area;
            const centerLatitude = (bounds.getNorth() + bounds.getSouth()) / 2;
            const latStep = params.cellSizeKm / 111.32;
            const lonStep = params.cellSizeKm / (111.32 * Math.max(0.1, Math.cos(centerLatitude * Math.PI / 180)));
            const rows = Math.max(1, Math.ceil((bounds.getNorth() - bounds.getSouth()) / latStep));
            const columns = Math.max(1, Math.ceil((bounds.getEast() - bounds.getWest()) / lonStep));
            const pointsPerLinkAtMaxRange = Math.ceil(params.maxDistance * 1000 / 30) + 1;
            const maxCells = Math.min(
                Math.floor(maxAnalyzedLinks / stations.length),
                Math.floor(maxAnalyzedPoints / (stations.length * pointsPerLinkAtMaxRange))
            );
            if (maxCells < 1) {
                throw new Error('O alcance máximo é grande demais para a grade selecionada. Reduza o alcance para continuar.');
            }
            let stepMultiplier = 1;
            while (Math.ceil(rows / stepMultiplier) * Math.ceil(columns / stepMultiplier) > maxCells) {
                stepMultiplier *= 1.25;
            }

            const gridRows = Math.max(1, Math.ceil(rows / stepMultiplier));
            const gridColumns = Math.max(1, Math.ceil(columns / stepMultiplier));
            const cells = [];
            const actualLatStep = (bounds.getNorth() - bounds.getSouth()) / gridRows;
            const actualLonStep = (bounds.getEast() - bounds.getWest()) / gridColumns;
            for (let row = 0; row < gridRows; row++) {
                for (let column = 0; column < gridColumns; column++) {
                    const position = {
                        lat: bounds.getSouth() + (row + 0.5) * actualLatStep,
                        lng: bounds.getWest() + (column + 0.5) * actualLonStep
                    };
                    if (isWithinArea(position, area)) cells.push(position);
                }
            }
            if (cells.length === 0) {
                throw new Error('A área visível do mapa não contém células para analisar. Ajuste o zoom ou enquadre a região desejada.');
            }
            const links = [];
            const linkCellIndices = [];
            const directlyCoveredCells = new Set();
            for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
                for (const station of stations) {
                    const distanceMeters = map.distance(station.position, cells[cellIndex]);
                    const distanceKm = distanceMeters / 1000;
                    if (distanceMeters <= 1) {
                        directlyCoveredCells.add(cellIndex);
                    } else if (distanceKm <= params.maxDistance) {
                        links.push({ from: station.position, to: cells[cellIndex] });
                        linkCellIndices.push(cellIndex);
                    }
                }
            }
            const results = links.length > 0
                ? (ensureLinkLimit(links), await radioPlanning.analyzeLinks(links, params.radioPreset, params.antennaHeight))
                : [];
            const coverageByCell = new Array(cells.length).fill(false);
            directlyCoveredCells.forEach(cellIndex => { coverageByCell[cellIndex] = true; });
            results.forEach((result, index) => {
                if (result.isViable) coverageByCell[linkCellIndices[index]] = true;
            });
            const halfLat = actualLatStep / 2;
            const halfLng = actualLonStep / 2;
            let gapCount = 0;
            for (let i = 0; i < cells.length; i++) {
                const position = cells[i];
                const covered = coverageByCell[i];
                if (!covered) gapCount++;
                const polygon = leaflet.polygon([
                    [position.lat - halfLat, position.lng - halfLng],
                    [position.lat - halfLat, position.lng + halfLng],
                    [position.lat + halfLat, position.lng + halfLng],
                    [position.lat + halfLat, position.lng - halfLng]
                ], {
                    color: covered ? '#16803c' : '#d00000',
                    weight: 0.5,
                    fillColor: covered ? '#28a745' : '#dc3545',
                    fillOpacity: 0.25
                }).addTo(planningLayer);
                polygon.bindPopup(covered ? 'Cobertura estimada' : 'Lacuna estimada de cobertura');
                polygon.feature = {
                    type: 'Feature',
                    properties: {
                        folderName: 'Sugestão de Planejamento',
                        name: covered ? 'Área coberta estimada' : 'Lacuna de cobertura estimada',
                        color: covered ? '#16803c' : '#d00000'
                    }
                };
            }
            log(`Cobertura estimada em ${cells.length} células: ${gapCount} lacunas identificadas; resolução aproximada de ${(params.cellSizeKm * stepMultiplier).toFixed(2)} km.`);
            return { cellCount: cells.length, gapCount };
        }

        /**
         * Verifica pontos de comunicação amostrados ao longo de linhas desenhadas.
         * @param {Object} params - Camada, ícone das estações, preset e intervalo amostral.
         * @returns {Promise<Object>} Quantidade de pontos amostrados sem enlace viável.
         */
        async function checkRouteCommunication(params) {
            const area = params.area || map.getBounds();
            const stations = collectMarkers(params.iconLayer).filter(marker => marker.iconUrl === params.stationIcon);
            if (stations.length === 0) {
                throw new Error('Nenhuma estação do tipo selecionado foi encontrada na camada de origem. Adicione esse marcador ou escolha outro tipo de ícone.');
            }

            const routes = [];
            getSourceLayer(params.iconLayer).eachLayer(layer => {
                if (!(layer instanceof leaflet.Polyline) || layer instanceof leaflet.Polygon) return;
                const positions = layer.getLatLngs().flat(Infinity);
                if (positions.length >= 2) routes.push(positions);
            });
            if (routes.length === 0) {
                throw new Error('A camada selecionada não contém uma linha de rota. Desenhe uma linha na mesma camada das estações antes de executar.');
            }

            const samples = [];
            const lines = [];
            const linkSampleIndexes = [];
            const directlyCoveredSamples = new Set();
            const routeStepKm = params.sampleInterval;
            for (const positions of routes) {
                const line = turf.lineString(positions.map(position => [position.lng, position.lat]));
                const lengthKm = turf.length(line, { units: 'kilometers' });
                if (lengthKm <= 0) continue;
                const stepCount = Math.ceil(lengthKm / routeStepKm);
                for (let index = 0; index <= stepCount; index++) {
                    const point = turf.along(line, Math.min(index * routeStepKm, lengthKm), { units: 'kilometers' });
                    const coordinates = point.geometry.coordinates;
                    const position = { lat: coordinates[1], lng: coordinates[0] };
                    if (!isWithinArea(position, area)) continue;
                    const sampleIndex = samples.push(position) - 1;
                    for (const station of stations) {
                        const distanceMeters = map.distance(station.position, position);
                        if (distanceMeters <= 1) {
                            directlyCoveredSamples.add(sampleIndex);
                            continue;
                        }
                        if (distanceMeters / 1000 > params.maxDistance) continue;
                        lines.push({ from: station.position, to: position });
                        linkSampleIndexes.push(sampleIndex);
                    }
                }
            }
            if (samples.length === 0) {
                throw new Error('Nenhum ponto da rota está na área visível do mapa. Ajuste o zoom ou enquadre o trecho que deseja avaliar.');
            }
            if (samples.length > maxAnalyzedLinks) {
                throw new Error(`A rota teria ${samples.length} pontos de amostragem. Aumente o intervalo entre amostras (limite: ${maxAnalyzedLinks}).`);
            }
            if (lines.length > 0) ensureLinkLimit(lines);
            const results = lines.length > 0
                ? await radioPlanning.analyzeLinks(lines, params.radioPreset, params.antennaHeight)
                : [];
            const bestBySample = new Array(samples.length).fill(null);
            results.forEach((result, index) => {
                const sampleIndex = linkSampleIndexes[index];
                const current = bestBySample[sampleIndex];
                if (!current || result.isViable) bestBySample[sampleIndex] = result;
            });
            let uncoveredCount = 0;
            for (let index = 0; index < samples.length; index++) {
                const position = samples[index];
                const result = bestBySample[index];
                const isCovered = (result && result.isViable) || directlyCoveredSamples.has(index);
                const color = isCovered ? '#16803c' : '#d00000';
                if (!isCovered) uncoveredCount++;
                drawCircle(
                    position,
                    color,
                    6,
                    isCovered ? 'Comunicação estimada' : 'Falha de comunicação estimada',
                    directlyCoveredSamples.has(index) && !result
                        ? 'Ponto coincidente com a posição de uma estação.'
                        : result
                        ? `${params.radioPreset === 'optical' ? 'Visada' : `Sinal: ${result.rxPower.toFixed(2)} dBm`}; distância do enlace ${result.distTotalKm.toFixed(2)} km.`
                        : 'Nenhuma estação próxima possui alcance suficiente.'
                );
            }
            log(`Rota analisada em ${samples.length} pontos; ${uncoveredCount} pontos sem enlace viável.`);
            return { sampleCount: samples.length, uncoveredCount };
        }

        /**
         * Gera locais candidatos na área visível e recomenda os que cobrem os tipos de ícone selecionados.
         * @param {Object} params - Tipos de ícone a cobrir, ícone da repetidora, preset e alcance.
         * @returns {Promise<Array<Object>>} Posições recomendadas ordenadas pela cobertura alcançada.
         */
        async function suggestRepeaterPositions(params) {
            const area = params.area || map.getBounds();
            const repeaterIcon = params.repeaterIcon || params.candidateIcon;
            const targetIcons = [...new Set(params.iconTypesToCover || [params.iconType1, params.iconType2].filter(Boolean))];
            if (!Number.isFinite(params.maxDistance) || params.maxDistance <= 0) {
                throw new Error('Informe uma distância máxima válida para cada enlace com a repetidora.');
            }
            if (!repeaterIcon || targetIcons.length === 0) {
                throw new Error('Selecione os tipos de ícone que precisam de cobertura e o ícone a colocar como repetidora.');
            }
            const markers = [
                ...collectMarkers('drawnItems', area),
                ...collectMarkers('planningSuggestions', area)
            ];
            const unitsByIcon = new Map(targetIcons.map(icon => [
                icon,
                markers.filter(marker => marker.iconUrl === icon)
            ]));
            const missingIcons = [...unitsByIcon]
                .filter(([, units]) => units.length === 0)
                .map(([icon]) => icon.substring(icon.lastIndexOf('/') + 1).split('.')[0]);
            if (missingIcons.length > 0) {
                throw new Error(`Não foram encontrados marcadores dos tipos selecionados na área visível: ${missingIcons.join(', ')}. Confira os ícones e ajuste o mapa.`);
            }

            const bounds = area instanceof leaflet.Polygon ? area.getBounds() : area;
            const centerLatitude = (bounds.getNorth() + bounds.getSouth()) / 2;
            const desiredCellSizeKm = 1;
            const latStep = desiredCellSizeKm / 111.32;
            const lonStep = desiredCellSizeKm / (111.32 * Math.max(0.1, Math.cos(centerLatitude * Math.PI / 180)));
            const rows = Math.max(1, Math.ceil((bounds.getNorth() - bounds.getSouth()) / latStep));
            const columns = Math.max(1, Math.ceil((bounds.getEast() - bounds.getWest()) / lonStep));
            const unitsPerCandidate = [...unitsByIcon.values()].reduce((total, units) => total + units.length, 0);
            const estimatedPointsPerLink = Math.max(2, Math.ceil(params.maxDistance * 1000 / 30) + 1);
            const maxCandidateCount = Math.max(1, Math.min(
                Math.floor(maxAnalyzedLinks / unitsPerCandidate),
                Math.floor(maxAnalyzedPoints / (unitsPerCandidate * estimatedPointsPerLink))
            ));
            let stepMultiplier = 1;
            while (Math.ceil(rows / stepMultiplier) * Math.ceil(columns / stepMultiplier) > maxCandidateCount) {
                stepMultiplier *= 1.25;
            }
            const gridRows = Math.max(1, Math.ceil(rows / stepMultiplier));
            const gridColumns = Math.max(1, Math.ceil(columns / stepMultiplier));
            const actualLatStep = (bounds.getNorth() - bounds.getSouth()) / gridRows;
            const actualLonStep = (bounds.getEast() - bounds.getWest()) / gridColumns;
            const candidates = [];
            for (let row = 0; row < gridRows; row++) {
                for (let column = 0; column < gridColumns; column++) {
                    const position = {
                        lat: bounds.getSouth() + (row + 0.5) * actualLatStep,
                        lng: bounds.getWest() + (column + 0.5) * actualLonStep
                    };
                    if (isWithinArea(position, area)) candidates.push(position);
                }
            }
            if (candidates.length === 0) {
                throw new Error('A área visível do mapa não contém posições para avaliar. Ajuste o zoom ou enquadre a região desejada.');
            }

            const links = [];
            const metadata = [];
            const directlyConnected = [];
            const targetIconIndexes = new Map(targetIcons.map((icon, index) => [icon, index]));
            for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
                const candidate = candidates[candidateIndex];
                for (const [icon, units] of unitsByIcon) {
                    const targetIconIndex = targetIconIndexes.get(icon);
                    for (const unit of units) {
                        const distanceKm = map.distance(candidate, unit.position) / 1000;
                        if (distanceKm <= 0.001) {
                            directlyConnected.push({ candidateIndex, targetIconIndex });
                        } else if (distanceKm <= params.maxDistance) {
                            links.push({ from: candidate, to: unit.position });
                            metadata.push({ candidateIndex, targetIconIndex });
                        }
                    }
                }
            }
            const ranked = candidates.map((position, candidateIndex) => ({
                position,
                coverageByIcon: new Array(targetIcons.length).fill(0)
            }));
            directlyConnected.forEach(connection => {
                const record = ranked[connection.candidateIndex];
                record.coverageByIcon[connection.targetIconIndex]++;
            });
            if (links.length > 0) ensureLinkLimit(links);
            const results = links.length > 0
                ? await radioPlanning.analyzeLinks(links, params.radioPreset, params.antennaHeight)
                : [];
            results.forEach((result, index) => {
                if (!result.isViable) return;
                const record = ranked[metadata[index].candidateIndex];
                record.coverageByIcon[metadata[index].targetIconIndex]++;
            });
            const bridges = ranked
                .filter(candidate => candidate.coverageByIcon.every(count => count > 0))
                .sort((a, b) => Math.min(...b.coverageByIcon) - Math.min(...a.coverageByIcon) ||
                    b.coverageByIcon.reduce((total, count) => total + count, 0) -
                    a.coverageByIcon.reduce((total, count) => total + count, 0));
            if (bridges.length === 0) {
                throw new Error('Nenhuma posição da área visível alcança todos os tipos de unidade selecionados com este preset e alcance. Aumente o alcance ou ajuste a região visível do mapa.');
            }

            const recommendations = bridges.slice(0, 10);
            recommendations.forEach((candidate, index) => {
                const isBest = index === 0;
                const name = isBest ? 'Posição recomendada para repetidor' : `Posição alternativa ${index + 1}`;
                const description = `Unidades com enlace viável: ${candidate.coverageByIcon.reduce((total, count) => total + count, 0)}.`;
                const marker = leaflet.marker(candidate.position, {
                    icon: leaflet.icon({
                        iconUrl: repeaterIcon,
                        iconSize: [32, 32],
                        iconAnchor: [16, 32],
                        popupAnchor: [0, -32]
                    })
                }).addTo(planningLayer);
                marker.bindPopup(`<b>${name}</b><br>${description}`);
                marker.feature = {
                    type: 'Feature',
                    properties: {
                        folderName: 'Sugestão de Planejamento',
                        name,
                        description,
                        coverageByIcon: Object.fromEntries(targetIcons.map((icon, targetIndex) => [
                            icon,
                            candidate.coverageByIcon[targetIndex]
                        ])),
                        iconUrl: repeaterIcon,
                        color: isBest ? '#16803c' : '#2864a5'
                    }
                };
            });
            log(`Posições de repetidor: ${bridges.length} locais da grade alcançam todos os tipos selecionados; foram marcadas as ${recommendations.length} melhores.`);
            return recommendations;
        }

        /**
         * Compara os presets disponíveis para os pares de ícones selecionados.
         * @param {Object} params - Camada, tipos de ícone, distância e área.
         * @returns {Promise<Object>} Resumo de enlaces viáveis em cada configuração.
         */
        async function compareRadioPresets(params) {
            const area = params.area || map.getBounds();
            const markers = collectMarkers(params.iconLayer, area);
            const pairs = collectPairs(markers, params.iconType1, params.iconType2, params.maxDistance);
            if (pairs.length === 0) {
                const firstCount = markers.filter(marker => marker.iconUrl === params.iconType1).length;
                const secondCount = markers.filter(marker => marker.iconUrl === params.iconType2).length;
                if (firstCount === 0 || secondCount === 0) {
                    const missingGroups = [
                        firstCount === 0 ? 'origem' : '',
                        secondCount === 0 ? 'destino' : ''
                    ].filter(Boolean).join(' e ');
                    throw new Error(`Nenhum ícone do grupo de ${missingGroups} está na área visível do mapa. Confira os tipos escolhidos, a camada de origem e enquadre as unidades.`);
                }
                throw new Error('Há ícones dos dois grupos na área visível, mas nenhum par está dentro da distância máxima. Aumente o alcance ou aproxime as unidades.');
            }
            if (pairs.length > maxComparedPairs) {
                throw new Error(`A comparação geraria ${pairs.length} pares. Reduza a área ou a distância máxima (limite: ${maxComparedPairs}).`);
            }
            const links = pairs.map(pair => ({
                from: pair.source.position,
                to: pair.target.position
            }));
            ensureLinkLimit(links, maxComparedPairs);
            const results = await radioPlanning.compareLinks(links, params.antennaHeight);
            const presets = radioPlanning.getPresets();
            const summary = {};
            for (const preset of presets) {
                const presetResults = results[preset.id];
                summary[preset.id] = {
                    label: preset.label,
                    viableCount: presetResults.filter(result => result.isViable).length
                };
            }
            pairs.forEach((pair, pairIndex) => {
                const viablePresets = presets.filter(preset => results[preset.id][pairIndex].isViable);
                const selectedPreset = viablePresets[0];
                const color = selectedPreset ? '#16803c' : '#d00000';
                const details = presets.map(preset => {
                    const result = results[preset.id][pairIndex];
                    return `${preset.label}: ${result.isViable ? 'viável' : 'falho'}${preset.id === 'optical' ? '' : ` (${result.rxPower.toFixed(1)} dBm)`}`;
                }).join('<br>');
                const line = leaflet.polyline([pair.source.position, pair.target.position], {
                    color,
                    weight: 3,
                    dashArray: '8, 5'
                }).addTo(planningLayer);
                line.bindPopup(`<b>Comparação de presets</b><br>${details}`);
                line.feature = {
                    type: 'Feature',
                    properties: {
                        folderName: 'Sugestão de Planejamento',
                        name: selectedPreset ? 'Enlace viável em ao menos um preset' : 'Enlace falho em todos os presets',
                        description: presets.map(preset => `${preset.label}: ${summary[preset.id].viableCount}/${pairs.length} enlaces viáveis`).join('; '),
                        color
                    }
                };
            });
            log(`Comparação concluída para ${pairs.length} pares: ${presets.map(preset => `${preset.label} ${summary[preset.id].viableCount}/${pairs.length}`).join('; ')}.`);
            return { pairCount: pairs.length, summary };
        }

        return Object.freeze({
            identifyCoverageGaps,
            checkRouteCommunication,
            suggestRepeaterPositions,
            compareRadioPresets
        });
    }
});
