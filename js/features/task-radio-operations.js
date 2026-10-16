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
         * Testa se uma coordenada está dentro de um polígono de cobertura.
         * @param {Object} position - Coordenada geográfica.
         * @param {Array<Object>} ring - Contorno do polígono.
         * @returns {boolean} Indica se a coordenada está dentro do contorno.
         */
        function isWithinRing(position, ring) {
            let inside = false;
            for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
                const first = ring[current];
                const second = ring[previous];
                const crosses = (first.lat > position.lat) !== (second.lat > position.lat) &&
                    position.lng < ((second.lng - first.lng) * (position.lat - first.lat)) /
                        (second.lat - first.lat) + first.lng;
                if (crosses) inside = !inside;
            }
            return inside;
        }

        /**
         * Retorna a interseção de dois segmentos em coordenadas geográficas planas.
         * @param {Object} a - Primeiro ponto do segmento inicial.
         * @param {Object} b - Segundo ponto do segmento inicial.
         * @param {Object} c - Primeiro ponto do segmento final.
         * @param {Object} d - Segundo ponto do segmento final.
         * @returns {Object|null} Ponto de interseção, se os segmentos se cruzarem.
         */
        function getSegmentIntersection(a, b, c, d) {
            const denominator = (a.lng - b.lng) * (c.lat - d.lat) -
                (a.lat - b.lat) * (c.lng - d.lng);
            if (Math.abs(denominator) < 1e-12) return null;

            const firstDeterminant = a.lng * b.lat - a.lat * b.lng;
            const secondDeterminant = c.lng * d.lat - c.lat * d.lng;
            const longitude = (firstDeterminant * (c.lng - d.lng) -
                (a.lng - b.lng) * secondDeterminant) / denominator;
            const latitude = (firstDeterminant * (c.lat - d.lat) -
                (a.lat - b.lat) * secondDeterminant) / denominator;
            const withinSegment = (point, start, end) =>
                point.lng >= Math.min(start.lng, end.lng) - 1e-10 &&
                point.lng <= Math.max(start.lng, end.lng) + 1e-10 &&
                point.lat >= Math.min(start.lat, end.lat) - 1e-10 &&
                point.lat <= Math.max(start.lat, end.lat) + 1e-10;
            const intersection = { lat: latitude, lng: longitude };
            return withinSegment(intersection, a, b) && withinSegment(intersection, c, d)
                ? intersection
                : null;
        }

        /**
         * Obtém posições candidatas nos cruzamentos ou dentro de áreas de cobertura sobrepostas.
         * @param {Array<Object>} coverages - Contornos calculados para os ícones selecionados.
         * @param {Array<string>} targetIcons - Tipos de ícone que precisam de cobertura.
         * @param {Object} area - Limites ou polígono de análise.
         * @returns {Array<Object>} Posições distintas dentro das interseções relevantes.
         */
        function getCoverageIntersectionCandidates(coverages, targetIcons, area) {
            const candidates = [];
            const addCandidate = position => {
                if (!isWithinArea(position, area)) return;
                const coveredAreas = coverages.filter(coverage => isWithinRing(position, coverage.ring));
                if (coveredAreas.length < Math.max(2, targetIcons.length) ||
                    !targetIcons.every(icon => coveredAreas.some(coverage => coverage.iconUrl === icon))) return;
                const matchingSourceCount = coveredAreas.length;
                const centerDistance = coveredAreas.reduce((total, coverage) =>
                    total + map.distance(position, coverage.position), 0) / matchingSourceCount;
                if (candidates.some(candidate => map.distance(candidate.position, position) < 30)) return;
                candidates.push({ position, coveredAreas, matchingSourceCount, centerDistance });
            };

            for (let firstIndex = 0; firstIndex < coverages.length; firstIndex++) {
                const first = coverages[firstIndex];
                for (let secondIndex = firstIndex + 1; secondIndex < coverages.length; secondIndex++) {
                    const second = coverages[secondIndex];
                    const intersections = [];
                    first.ring.forEach(point => {
                        if (isWithinRing(point, second.ring)) addCandidate(point);
                    });
                    second.ring.forEach(point => {
                        if (isWithinRing(point, first.ring)) addCandidate(point);
                    });
                    for (let firstEdge = 0; firstEdge < first.ring.length; firstEdge++) {
                        const firstStart = first.ring[firstEdge];
                        const firstEnd = first.ring[(firstEdge + 1) % first.ring.length];
                        for (let secondEdge = 0; secondEdge < second.ring.length; secondEdge++) {
                            const intersection = getSegmentIntersection(
                                firstStart,
                                firstEnd,
                                second.ring[secondEdge],
                                second.ring[(secondEdge + 1) % second.ring.length]
                            );
                            if (intersection) {
                                intersections.push(intersection);
                                addCandidate(intersection);
                            }
                        }
                    }
                    if (intersections.length > 1) {
                        const center = intersections.reduce((total, point) => ({
                            lat: total.lat + point.lat / intersections.length,
                            lng: total.lng + point.lng / intersections.length
                        }), { lat: 0, lng: 0 });
                        addCandidate(center);
                    }
                    addCandidate({
                        lat: (first.position.lat + second.position.lat) / 2,
                        lng: (first.position.lng + second.position.lng) / 2
                    });
                }
            }

            const coverageGroups = [
                coverages,
                ...targetIcons.map(icon => coverages.filter(coverage => coverage.iconUrl === icon))
            ];
            for (const group of coverageGroups) {
                if (group.length < 2) continue;
                addCandidate(group.reduce((center, coverage) => ({
                    lat: center.lat + coverage.position.lat / group.length,
                    lng: center.lng + coverage.position.lng / group.length
                }), { lat: 0, lng: 0 }));
            }

            return candidates.sort((a, b) =>
                b.matchingSourceCount - a.matchingSourceCount ||
                a.centerDistance - b.centerDistance
            );
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
         * Calcula a cobertura de cada unidade e recomenda locais nas interseções dessas áreas.
         * @param {Object} params - Tipos de ícone, repetidora, preset, alcance e altura das antenas.
         * @param {Function} [onProgress] - Atualiza a interface durante o cálculo das áreas.
         * @returns {Promise<Array<Object>>} Posições recomendadas ordenadas pelas unidades alcançadas.
         */
        async function suggestRepeaterPositions(params, onProgress = () => {}) {
            const area = params.area || map.getBounds();
            const repeaterIcon = params.repeaterIcon || params.candidateIcon;
            const targetIcons = [...new Set(params.iconTypesToCover || [params.iconType1, params.iconType2].filter(Boolean))];
            const maxRepeaters = params.maxRepeaters ?? 10;
            const minimumRepeaterDistanceKm = params.minimumRepeaterDistanceKm ?? 0.5;
            if (!Number.isFinite(params.maxDistance) || params.maxDistance <= 0) {
                throw new Error('Informe uma distância máxima válida para cada enlace com a repetidora.');
            }
            if (!Number.isInteger(maxRepeaters) || maxRepeaters < 1 || maxRepeaters > 40) {
                throw new Error('Informe de 1 a 40 posições máximas para as repetidoras.');
            }
            if (!Number.isFinite(minimumRepeaterDistanceKm) || minimumRepeaterDistanceKm < 0) {
                throw new Error('Informe uma distância mínima válida entre as repetidoras (zero desativa o espaçamento).');
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
            const targetUnitMap = new Map();
            for (const [iconUrl, units] of unitsByIcon) {
                for (const unit of units) {
                    const key = `${iconUrl}:${unit.position.lat.toFixed(6)}:${unit.position.lng.toFixed(6)}`;
                    if (!targetUnitMap.has(key)) targetUnitMap.set(key, { ...unit, iconUrl });
                }
            }
            const targetUnits = [...targetUnitMap.values()];
            if (targetUnits.length > 40) {
                throw new Error(`Há ${targetUnits.length} unidades dos tipos selecionados na área visível. Reduza a área ou escolha menos tipos (limite: 40 unidades).`);
            }

            const coverages = [];
            const radialCount = 72;
            const maxCoverageSteps = Math.floor(maxAnalyzedPoints / radialCount) - 1;
            const resolutionKm = Math.max(0.05, params.maxDistance / maxCoverageSteps);
            for (let unitIndex = 0; unitIndex < targetUnits.length; unitIndex++) {
                const unit = targetUnits[unitIndex];
                const resolutionMeters = Math.round(resolutionKm * 1000);
                const message = `Calculando área de cobertura ${unitIndex + 1} de ${targetUnits.length} (resolução aproximada: ${resolutionMeters} m)…`;
                log(message);
                onProgress(message);
                await new Promise(resolve => setTimeout(resolve, 0));
                const ring = await radioPlanning.analyzeCoverageBoundary(
                    unit.position,
                    params.radioPreset,
                    params.maxDistance,
                    params.antennaHeight,
                    { radialCount, resolutionKm }
                );
                const distinctPoints = ring.filter((point, index) =>
                    index === 0 || map.distance(point, ring[index - 1]) > 1
                );
                if (distinctPoints.length >= 3) {
                    coverages.push({ position: unit.position, iconUrl: unit.iconUrl, ring });
                }
            }

            if (coverages.length < 2) {
                throw new Error('Não foi possível formar áreas de cobertura sobrepostas. Confira o alcance, o preset e as alturas das antenas.');
            }

            onProgress('Identificando interseções entre as áreas de cobertura…');
            await new Promise(resolve => setTimeout(resolve, 0));
            const candidates = getCoverageIntersectionCandidates(coverages, targetIcons, area).slice(0, 40);
            if (candidates.length === 0) {
                throw new Error('As áreas de cobertura calculadas não têm interseções que alcancem todos os tipos de unidade selecionados. Aumente o alcance ou ajuste a região visível do mapa.');
            }

            const indexedCandidates = candidates.map(candidate => ({
                ...candidate,
                coverageByIcon: new Array(targetIcons.length).fill(0),
                connectedUnitCount: 0
            }));
            const targetIconIndexes = new Map(targetIcons.map((icon, index) => [icon, index]));
            const links = [];
            const metadata = [];
            indexedCandidates.forEach((candidate, candidateIndex) => {
                candidate.coveredAreas.forEach(coverage => {
                    const distanceKm = map.distance(candidate.position, coverage.position) / 1000;
                    if (distanceKm <= 0.001) {
                        candidate.connectedUnitCount++;
                        candidate.coverageByIcon[targetIconIndexes.get(coverage.iconUrl)]++;
                    } else if (distanceKm <= params.maxDistance) {
                        links.push({ from: candidate.position, to: coverage.position });
                        metadata.push({ candidateIndex, iconUrl: coverage.iconUrl });
                    }
                });
            });

            let linkOffset = 0;
            while (linkOffset < links.length) {
                const batch = [];
                let estimatedPoints = 0;
                while (linkOffset < links.length && batch.length < 30) {
                    const nextLink = links[linkOffset];
                    const linkPoints = Math.max(2, Math.ceil(map.distance(nextLink.from, nextLink.to) / 30) + 1);
                    if (batch.length > 0 && estimatedPoints + linkPoints > maxAnalyzedPoints) break;
                    batch.push(nextLink);
                    estimatedPoints += linkPoints;
                    linkOffset++;
                }
                ensureLinkLimit(batch);
                const results = await radioPlanning.analyzeLinks(batch, params.radioPreset, params.antennaHeight);
                results.forEach((result, batchIndex) => {
                    if (!result.isViable) return;
                    const linkIndex = linkOffset - batch.length + batchIndex;
                    const { candidateIndex, iconUrl } = metadata[linkIndex];
                    indexedCandidates[candidateIndex].connectedUnitCount++;
                    indexedCandidates[candidateIndex].coverageByIcon[targetIconIndexes.get(iconUrl)]++;
                });
                onProgress(`Validando os locais de interseção (${Math.min(linkOffset, links.length)} de ${links.length} enlaces)…`);
            }

            const bridges = indexedCandidates
                .filter(candidate => candidate.connectedUnitCount >= 2 &&
                    candidate.coverageByIcon.every(count => count > 0))
                .sort((a, b) => b.connectedUnitCount - a.connectedUnitCount ||
                    Math.min(...b.coverageByIcon) - Math.min(...a.coverageByIcon) ||
                    a.centerDistance - b.centerDistance);
            if (bridges.length === 0) {
                throw new Error('As interseções encontradas não mantêm enlaces viáveis com todos os tipos selecionados. Aumente o alcance ou ajuste o preset e a altura das antenas.');
            }

            const recommendations = [];
            for (const candidate of bridges) {
                if (recommendations.some(existing =>
                    map.distance(existing.position, candidate.position) < minimumRepeaterDistanceKm * 1000
                )) continue;
                recommendations.push(candidate);
                if (recommendations.length === maxRepeaters) break;
            }
            recommendations.forEach((candidate, index) => {
                const isBest = index === 0;
                const name = isBest ? 'Posição recomendada para repetidor' : `Posição alternativa ${index + 1}`;
                const description = `Interseção de ${candidate.connectedUnitCount} áreas de cobertura; enlaces viáveis para ${candidate.coverageByIcon.reduce((total, count) => total + count, 0)} unidades.`;
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
            log(`Posições de repetidor: ${recommendations.length} locais nas interseções das áreas de cobertura foram marcados.`);
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
            checkRouteCommunication,
            suggestRepeaterPositions,
            compareRadioPresets
        });
    }
});
