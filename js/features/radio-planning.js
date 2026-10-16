/**
 * @fileoverview Implementa simulações de enlace de rádio e visada ótica, desenha resultados e apresenta gráficos.
 * @exports window.PlanMilT.radioPlanning
 * @requires Leaflet, Turf, Chart, drawnItems e SweetAlert injetados
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.radioPlanning = Object.freeze({
    /**
     * Conecta a interface de simulação e os eventos de planejamento ao mapa.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {Object} dependencies.map - Instância Leaflet do mapa principal.
     * @param {Object} dependencies.leaflet - Namespace Leaflet usado para criar camadas e controles.
     * @param {Object} dependencies.turf - Biblioteca Turf para operações geoespaciais.
     * @param {Object} dependencies.drawnItems - Grupo Leaflet com os elementos desenhados pelo usuário.
     * @param {Object} dependencies.sweetAlert - Interface SweetAlert para confirmação, carregamento e notificações.
     * @param {*} dependencies.chartConstructor - Construtor Chart.js usado para renderizar gráficos.
     */
    attach({ map, leaflet, turf, drawnItems, sweetAlert, chartConstructor }) {
        const L = leaflet;
        const Swal = sweetAlert;
        const Chart = chartConstructor;

                var rfModeActive = false;
                var rfPoints = [];
                var rfTempLayer = L.layerGroup().addTo(map);
                var rfParams = {};
                const rfGeneratedLayers = []; 

                // Banco de dados de Presets (Incluindo Linha de Visada)
                const radioPresets = {
                    'custom': { label: 'Personalizado / Manual (RF)', freq: 450, txPower: 37, txGain: 2, txHeight: 1.5, rxGain: 2, rxHeight: 1.5, rxSens: -105, radius: 5 },
                    'optical': { label: 'Ótico (Linha de Visada)', freq: 0, txPower: 0, txGain: 0, txHeight: 1.5, rxGain: 0, rxHeight: 1.5, rxSens: 0, radius: 3 },
                    'harris_hh': { label: 'Harris RF-7800V-HH (VHF Portátil 10W)', freq: 50, txPower: 40, txGain: 2, txHeight: 1.5, rxGain: 2, rxHeight: 1.5, rxSens: -116, radius: 15 },
                    'harris_v51x': { label: 'Harris RF-7800V-V51X (VHF Veicular 50W)', freq: 50, txPower: 47, txGain: 3, txHeight: 3.0, rxGain: 3, rxHeight: 1.5, rxSens: -116, radius: 30 },
                    'apx2000': { label: 'Motorola APX 2000 (800MHz Portátil 3W)', freq: 850, txPower: 35, txGain: 2, txHeight: 1.5, rxGain: 2, rxHeight: 1.5, rxSens: -119, radius: 8 },
                    'gtr8000': { label: 'Motorola GTR-8000 (800MHz Repetidora 100W)', freq: 850, txPower: 50, txGain: 6, txHeight: 30, rxGain: 6, rxHeight: 1.5, rxSens: -118, radius: 40 },
                    'airgrid_m5': { label: 'Ubiquiti AirGrid M5 (5.8GHz Dados PTP)', freq: 5800, txPower: 25, txGain: 23, txHeight: 15, rxGain: 23, rxHeight: 15, rxSens: -85, radius: 20 }
                };

                document.getElementById('linkPredictionBtn').addEventListener('click', async function() {
                    if (rfModeActive) {
                        this.style.color = '';
                        map.getContainer().style.cursor = '';
                        rfModeActive = false;
                        rfPoints = [];
                        rfTempLayer.clearLayers();
                        return;
                    }

                    const { value: formValues } = await Swal.fire({
                        title: '<i class="fas fa-broadcast-tower"></i> Predição de Alcance',
                        html: `
                            <style>
                                .rf-form { text-align: left; font-size: 13px; }
                                .rf-form label { display: block; margin-top: 8px; font-weight: bold; color: #333; }
                                .rf-form input, .rf-form select { width: 100%; padding: 6px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
                                .rf-form .row { display: flex; gap: 15px; }
                                .rf-form .col { flex: 1; }
                                .watts-display { color: #007bff; font-size: 11px; margin-left: 5px; font-weight: normal; }
                                .btn-clear-rf { margin-top: 15px; width: 100%; background-color: #dc3545; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; font-weight: bold; }
                                .btn-clear-rf:hover { background-color: #c82333; }
                            </style>
                            <div class="rf-form">
                                <label>Tipo de Simulação</label>
                                <select id="rfPreset" style="background-color:#e8f4f8; font-weight:bold;">
                                    <option value="custom">Personalizado / Manual (RF)</option>
                                    <option value="optical" style="color:red;">👁️ Ótico (Linha de Visada / Câmera / Armamento)</option>
                                    <option value="harris_hh">📻 Harris RF-7800V-HH (VHF Portátil 10W)</option>
                                    <option value="harris_v51x">📻 Harris RF-7800V-V51X (VHF Veicular 50W)</option>
                                    <option value="apx2000">📻 Motorola APX 2000 (800MHz Portátil 3W)</option>
                                    <option value="gtr8000">📻 Motorola GTR-8000 (800MHz Repetidora 100W)</option>
                                    <option value="airgrid_m5">📡 Ubiquiti AirGrid M5 (5.8GHz Dados PTP)</option>
                                </select>
                                <hr style="margin: 10px 0; border: 0.5px solid #eee;">
                                
                                <label>Modo de Predição</label>
                                <select id="rfMode">
                                    <option value="ptp">Enlace Ponto-a-Ponto (PTP)</option>
                                    <option value="coverage" selected>Área de Cobertura</option>
                                </select>
                                
                                <!-- PARÂMETROS EXCLUSIVOS DE RF (Ocultos no modo Ótico) -->
                                <div id="rfSpecificOptions">
                                    <div class="row">
                                        <div class="col"><label>Freq. (MHz)</label><input id="rfFreq" type="number" step="0.1" value="450"></div>
                                        <div class="col"><label>Potência Tx (dBm) <span id="wattsDisplay" class="watts-display"></span></label><input id="rfTxPower" type="number" value="37"></div>
                                    </div>
                                    <div class="row">
                                        <div class="col"><label>Ganho Tx (dBi)</label><input id="rfTxGain" type="number" value="2"></div>
                                        <div class="col"><label>Ganho Rx (dBi)</label><input id="rfRxGain" type="number" value="2"></div>
                                    </div>
                                    <div class="row">
                                        <div class="col"><label>Sensibilidade (dBm)</label><input id="rfRxSens" type="number" value="-105"></div>
                                        <div class="col"></div>
                                    </div>
                                </div>
                                
                                <!-- PARÂMETROS GERAIS (Alturas e Raio) -->
                                <div class="row">
                                    <div class="col"><label>Altura Base / Tx (m)</label><input id="rfTxHeight" type="number" step="0.1" value="1.5"></div>
                                    <div class="col"><label>Altura Alvo / Rx (m)</label><input id="rfRxHeight" type="number" step="0.1" value="1.5"></div>
                                </div>
                                <div class="row" id="colRadius">
                                    <div class="col"><label>Raio Máx de Varredura (km)</label><input id="rfRadius" type="number" step="0.1" value="5"></div>
                                </div>
                                
                                <button type="button" id="btnClearRFLayers" class="btn-clear-rf"><i class="fas fa-trash"></i> Limpar Simulações Anteriores</button>
                            </div>
                        `,
                        focusConfirm: false,
                        showCancelButton: true,
                        confirmButtonText: 'Ativar Ferramenta',
                        cancelButtonText: 'Cancelar',
                        didOpen: () => {
                            /**
                             * Atualiza a indicação de potência em watts a partir do valor em dBm.
                             * @returns {void} Não retorna valor.
                             */
                            const updateWatts = () => {
                                let dbm = parseFloat(document.getElementById('rfTxPower').value) || 0;
                                let watts = Math.pow(10, (dbm - 30) / 10);
                                let text = watts >= 1 ? watts.toFixed(1) + ' W' : (watts * 1000).toFixed(0) + ' mW';
                                document.getElementById('wattsDisplay').innerText = `(= ${text})`;
                            };

                            // Dinâmica de exibir/ocultar campos dependendo do Preset
                            document.getElementById('rfPreset').addEventListener('change', function(e) {
                                let val = e.target.value;
                                let pre = radioPresets[val];
                                
                                if(pre) {
                                    document.getElementById('rfFreq').value = pre.freq;
                                    document.getElementById('rfTxPower').value = pre.txPower;
                                    document.getElementById('rfTxGain').value = pre.txGain;
                                    document.getElementById('rfTxHeight').value = pre.txHeight;
                                    document.getElementById('rfRxGain').value = pre.rxGain;
                                    document.getElementById('rfRxHeight').value = pre.rxHeight;
                                    document.getElementById('rfRxSens').value = pre.rxSens;
                                    document.getElementById('rfRadius').value = pre.radius;
                                    
                                    if(val === 'airgrid_m5') {
                                        document.getElementById('rfMode').value = 'ptp';
                                        document.getElementById('colRadius').style.display = 'none';
                                    }
                                    updateWatts();
                                }
                                
                                // Oculta opções de RF se for Linha de Visada (Ótico)
                                document.getElementById('rfSpecificOptions').style.display = (val === 'optical') ? 'none' : 'block';
                            });

                            document.getElementById('rfMode').addEventListener('change', function(e) {
                                document.getElementById('colRadius').style.display = (e.target.value === 'coverage') ? 'block' : 'none';
                            });

                            document.getElementById('rfTxPower').addEventListener('input', updateWatts);
                            updateWatts();

                            document.getElementById('btnClearRFLayers').addEventListener('click', function() {
                                if(rfGeneratedLayers.length > 0) {
                                    rfGeneratedLayers.forEach(layer => {
                                        if (map.hasLayer(layer)) map.removeLayer(layer);
                                        if (drawnItems.hasLayer(layer)) drawnItems.removeLayer(layer);
                                    });
                                    rfGeneratedLayers = [];
                                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Camadas apagadas!', showConfirmButton: false, timer: 3000 });
                                } else {
                                    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Nada para limpar.', showConfirmButton: false, timer: 2000 });
                                }
                            });
                        },
                        preConfirm: () => {
                            return {
                                mode: document.getElementById('rfMode').value,
                                freq: parseFloat(document.getElementById('rfFreq').value) || 0,
                                txPower: parseFloat(document.getElementById('rfTxPower').value) || 0,
                                txGain: parseFloat(document.getElementById('rfTxGain').value) || 0,
                                txHeight: parseFloat(document.getElementById('rfTxHeight').value),
                                rxGain: parseFloat(document.getElementById('rfRxGain').value) || 0,
                                rxHeight: parseFloat(document.getElementById('rfRxHeight').value),
                                rxSens: parseFloat(document.getElementById('rfRxSens').value) || 0,
                                radius: parseFloat(document.getElementById('rfRadius').value),
                                isOptical: (document.getElementById('rfPreset').value === 'optical') // Flag Ótica
                            }
                        }
                    });

                    if (formValues) {
                        rfParams = formValues;
                        rfModeActive = true;
                        this.style.color = '#007bff';
                        map.getContainer().style.cursor = 'crosshair';
                        
                        let msg = rfParams.mode === 'ptp' 
                            ? 'Ponto-a-Ponto: Clique na Base, e depois no Alvo.' 
                            : 'Cobertura: Clique no local da Base/Atirador.';
                        
                        Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: msg, showConfirmButton: false, timer: 4000 });
                    }
                });

                map.on('click', function(e) {
                    if (!rfModeActive) return;

                    rfPoints.push(e.latlng);
                    L.marker(e.latlng, {
                        icon: L.divIcon({className: 'fas fa-map-pin', iconSize: [20, 20], html: `<div style="color:red; font-size: 24px;"><i class="fas fa-map-marker-alt"></i></div>`})
                    }).addTo(rfTempLayer);

                    if (rfParams.mode === 'ptp' && rfPoints.length === 2) {
                        desativarEExecutar(() => calcularPTP(rfPoints[0], rfPoints[1], rfParams));
                    } else if (rfParams.mode === 'coverage' && rfPoints.length === 1) {
                        desativarEExecutar(() => calcularCobertura(rfPoints[0], rfParams));
                    }
                });

                /**
                 * Desativa temporariamente uma ação concorrente e executa o callback fornecido.
                 * @param {Function} callback - Função chamada após a operação configurada.
                 */
                function desativarEExecutar(callback) {
                    map.getContainer().style.cursor = '';
                    document.getElementById('linkPredictionBtn').style.color = '';
                    rfModeActive = false;
                    callback();
                    rfPoints = [];
                }

                // ==========================================
                // 1. CÁLCULO PONTO A PONTO (PTP E ÓTICO)
                // ==========================================
                /**
                 * Calcula o orçamento e as condições do enlace ponto a ponto.
                 * @param {Object} pt1 - Primeiro ponto do enlace.
                 * @param {Object} pt2 - Segundo ponto do enlace.
                 * @param {Object} p - Parâmetros de configuração da simulação.
                 */
                async function analisarEnlace(pt1, pt2, p) {
                    let line = turf.lineString([[pt1.lng, pt1.lat], [pt2.lng, pt2.lat]]);
                    let distTotalKm = turf.length(line, { units: 'kilometers' });
                    let segments = Math.max(1, Math.ceil(distTotalKm / 0.03));
                    let pointsArray = [];
                    for (let i = 0; i <= segments; i++) {
                        let dist = (i / segments) * distTotalKm;
                        let point = turf.along(line, dist, { units: 'kilometers' });
                        pointsArray.push({ latitude: point.geometry.coordinates[1], longitude: point.geometry.coordinates[0], distKm: dist });
                    }

                    const data = await requestElevation(pointsArray);
                    let hasObstruction = false;
                    let hTx = data[0].elevation + p.txHeight;
                    let hRx = data[data.length - 1].elevation + p.rxHeight;
                    let topoData = [], losData = [], fresnelDataLower = [], fresnelDataUpper = [], labels = [];
                    let freqGHz = p.isOptical ? 1 : (p.freq / 1000);

                    for (let i = 0; i < data.length; i++) {
                        let d1 = pointsArray[i].distKm;
                        let d2 = distTotalKm - d1;
                        let curvatura = (d1 * d2) / (12.74 * 1.333);
                        let hAdjusted = data[i].elevation + curvatura;
                        let hLos = hTx - ((hTx - hRx) * (d1 / distTotalKm));
                        let fresnelRadius = (p.isOptical || d1 <= 0 || d2 <= 0) ? 0 : 17.32 * Math.sqrt((d1 * d2) / (freqGHz * distTotalKm));
                        let hFresnelLower = hLos - (0.6 * fresnelRadius);
                        let hFresnelUpper = hLos + (0.6 * fresnelRadius);
                        if (hAdjusted > hFresnelLower && i > 0 && i < data.length - 1) hasObstruction = true;
                        topoData.push(hAdjusted.toFixed(2));
                        losData.push(hLos.toFixed(2));
                        fresnelDataLower.push(hFresnelLower.toFixed(2));
                        fresnelDataUpper.push(hFresnelUpper.toFixed(2));
                        labels.push(d1.toFixed(2) + ' km');
                    }

                    let rxPower = 0;
                    let isViable;
                    if (p.isOptical) {
                        isViable = !hasObstruction;
                    } else {
                        let fspl = 20 * Math.log10(distTotalKm) + 20 * Math.log10(p.freq) + 32.44;
                        rxPower = p.txPower + p.txGain - fspl + p.rxGain;
                        let isMicrowave = p.freq > 1000;
                        isViable = isMicrowave ? (!hasObstruction && rxPower >= p.rxSens) : (rxPower >= p.rxSens);
                    }

                    return { distTotalKm, hasObstruction, rxPower, isViable, labels, topoData, losData, fresnelDataLower, fresnelDataUpper };
                }

                /**
                 * Avalia um enlace com os parâmetros já usados pela ferramenta de predição.
                 * @param {Object} pt1 - Primeiro ponto geográfico do enlace.
                 * @param {Object} pt2 - Segundo ponto geográfico do enlace.
                 * @param {string} presetId - Identificador do preset de rádio ou visada.
                 * @returns {Promise<Object>} Métricas de viabilidade e perfil do enlace.
                 */
                async function analisarEnlaceComPreset(pt1, pt2, presetId) {
                    const preset = radioPresets[presetId];
                    if (!preset || presetId === 'custom') throw new Error('Preset de enlace inválido.');
                    return analisarEnlace(pt1, pt2, { ...preset, isOptical: presetId === 'optical' });
                }

                async function calcularPTP(pt1, pt2, p) {
                    Swal.fire({ title: 'Simulando Enlace...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    try {
                        const result = await analisarEnlace(pt1, pt2, p);
                        const { distTotalKm, hasObstruction, rxPower, isViable, labels, topoData, losData, fresnelDataLower, fresnelDataUpper } = result;
                        Swal.close();
                        let linkColor = isViable ? '#00ff00' : '#ff0000';
                        let linkPolyline = L.polyline([pt1, pt2], { color: linkColor, weight: 4, dashArray: '10, 5' }).addTo(drawnItems); 

                        let popupHtml = p.isOptical ? 
                            `<b>Análise de Visada (Ótica)</b><br>Status: <strong style="color:${linkColor}">${isViable ? 'VISADA LIMPA' : 'ALVO OBSTRUÍDO'}</strong><br>Distância: ${distTotalKm.toFixed(2)} km` :
                            `<b>Relatório do Enlace (RF)</b><br>Status: <strong style="color:${linkColor}">${isViable ? 'VIÁVEL' : 'FALHO'}</strong><br>Sinal (FSPL): ${rxPower.toFixed(2)} dBm<br>Sensibilidade: ${p.rxSens} dBm<br>Obstrução Fresnel: ${hasObstruction ? 'Sim' : 'Não'}<br>Distância: ${distTotalKm.toFixed(2)} km<br>Freq: ${p.freq} MHz`;

                        linkPolyline.bindPopup(popupHtml);
                        rfGeneratedLayers.push(linkPolyline);
                        rfTempLayer.clearLayers();
                        
                        exibirGraficoEnlace(labels, topoData, losData, fresnelDataLower, fresnelDataUpper, p.freq, distTotalKm, p.isOptical);

                    } catch (error) {
                        handleRFError(error);
                    }
                }

                // ==========================================
                // 2. CÁLCULO DE COBERTURA (HEATMAP RF E ÓTICO)
                // ==========================================
                /**
                 * Calcula a cobertura RF a partir do centro e dos parâmetros da simulação.
                 * @param {Object} center - Centro geográfico da forma ou simulação.
                 * @param {Object} p - Parâmetros de configuração da simulação.
                 */
                async function calcularCobertura(center, p) {
                    Swal.fire({ title: 'Realizando predição de enlace... Aguarde.', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
                    try {
                        let radiais = 72;
                        let resolucaoKm = 0.05;
                        let maxPassos = Math.ceil(p.radius / resolucaoKm);
                        let pointReqArray = [];
                        
                        for (let r = 0; r < radiais; r++) {
                            let angle = (360 / radiais) * r;
                            for (let i = 0; i <= maxPassos; i++) {
                                let dist = i * resolucaoKm;
                                let dest = turf.destination([center.lng, center.lat], dist, angle, {units: 'kilometers'});
                                pointReqArray.push({ latitude: dest.geometry.coordinates[1], longitude: dest.geometry.coordinates[0], distKm: dist, angle: angle, radialId: r });
                            }
                        }

                        const data = await requestElevation(pointReqArray);
                        if (!data || data.length !== pointReqArray.length) throw new Error("Dados topográficos insuficientes.");

                        let validCells = []; 
                        let K = 1.333;
                        let halfAngle = (360 / radiais) / 2;
                        let halfDist = resolucaoKm / 2;
                        let freqGHz = p.isOptical ? 1 : (p.freq / 1000);
                        
                        let isMicrowave = p.freq > 1000;
                        let fresnelClearance = p.isOptical ? 0.0 : (isMicrowave ? 0.6 : 0.0);
                        
                        /**
                         * Determina a cor de apresentação segundo o nível e a sensibilidade do sinal.
                         * @param {number} rx - Nível de potência recebida em dBm.
                         * @param {number} sens - Sensibilidade mínima do receptor em dBm.
                         */
                        function getSignalColor(rx, sens) {
                            let margin = rx - sens;
                            if (margin >= 35) return '#00ff00'; 
                            if (margin >= 25) return '#99ff33'; 
                            if (margin >= 15) return '#ffff00'; 
                            if (margin >= 5)  return '#ff9900'; 
                            return '#ff0000';                   
                        }

                        for (let r = 0; r < radiais; r++) {
                            let radialIndices = [];
                            for(let k = 0; k < pointReqArray.length; k++){
                                if(pointReqArray[k].radialId === r) radialIndices.push(k);
                            }

                            let startIdx = radialIndices[0];
                            let hTx = data[startIdx].elevation + p.txHeight; 

                            for (let i = 1; i < radialIndices.length; i++) {
                                let idx = radialIndices[i];
                                let d1 = pointReqArray[idx].distKm;
                                
                                if (d1 === 0) continue; 

                                let hRx = data[idx].elevation + p.rxHeight;
                                let rxPower = 0;
                                
                                if (!p.isOptical) {
                                    let fspl = 20 * Math.log10(d1) + 20 * Math.log10(p.freq) + 32.44;
                                    let clutterLoss = isMicrowave ? (2 + (2 * d1)) : (10 + (6 * d1)); 
                                    rxPower = p.txPower + p.txGain - fspl - clutterLoss + p.rxGain;
                                }
                                
                                let isObstructed = false;
                                let maxObstructionMeters = 0;

                                for (let j = 1; j < i; j++) {
                                    let idxJ = radialIndices[j];
                                    let distJ = pointReqArray[idxJ].distKm;
                                    let distRestante = d1 - distJ;
                                    
                                    let curvatura = (distJ * distRestante) / (12.74 * K);
                                    let terrenoJ = data[idxJ].elevation + curvatura;
                                    
                                    let hLos = hTx - ( (hTx - hRx) * (distJ / d1) );
                                    let fresnelRadius = p.isOptical ? 0 : 17.32 * Math.sqrt((distJ * distRestante) / (freqGHz * d1));
                                    let hRequired = hLos - (fresnelClearance * fresnelRadius);

                                    if (terrenoJ > hRequired) {
                                        // Visada Ótica e Micro-ondas param estritamente ao encostar no relevo
                                        if (isMicrowave || p.isOptical) {
                                            isObstructed = true;
                                            break;
                                        } else {
                                            let blockage = terrenoJ - hRequired;
                                            if (blockage > maxObstructionMeters) maxObstructionMeters = blockage;
                                        }
                                    }
                                }

                                if ((isMicrowave || p.isOptical) && isObstructed) continue;

                                if (!p.isOptical && !isMicrowave && maxObstructionMeters > 0) {
                                    rxPower -= (maxObstructionMeters * 1.5);
                                }

                                if (!p.isOptical && rxPower < p.rxSens) continue; 

                                let currentPoint = pointReqArray[idx];
                                let dist1 = Math.max(0, currentPoint.distKm - halfDist);
                                let dist2 = currentPoint.distKm + halfDist;
                                let angle1 = currentPoint.angle - halfAngle;
                                let angle2 = currentPoint.angle + halfAngle;

                                let p1 = turf.destination([center.lng, center.lat], dist1, angle1, {units: 'kilometers'}).geometry.coordinates;
                                let p2 = turf.destination([center.lng, center.lat], dist2, angle1, {units: 'kilometers'}).geometry.coordinates;
                                let p3 = turf.destination([center.lng, center.lat], dist2, angle2, {units: 'kilometers'}).geometry.coordinates;
                                let p4 = turf.destination([center.lng, center.lat], dist1, angle2, {units: 'kilometers'}).geometry.coordinates;

                                let cellColor = p.isOptical ? '#ffff00' : getSignalColor(rxPower, p.rxSens);

                                validCells.push(turf.polygon([[p1, p2, p3, p4, p1]], { rxPower: p.isOptical ? 'Visível' : rxPower.toFixed(2), color: cellColor }));
                            }
                        }

                        Swal.close();

                        if (validCells.length > 0) {
                            let coverageGeoJSON = turf.featureCollection(validCells);
                            
                            let coverageLayer = L.geoJSON(coverageGeoJSON, {
                                style: function(feature) {
                                    return {
                                        color: feature.properties.color,
                                        weight: 0.2, 
                                        fillColor: feature.properties.color,
                                        fillOpacity: p.isOptical ? 0.45 : 0.6 // Visada ótica fica um pouco mais transparente (Amarelo)
                                    };
                                },
                                onEachFeature: function(feature, layer) {
                                    let balao = p.isOptical ? `<b>Área Visível (LOS)</b>` : `<b>Sinal Estimado:</b> ${feature.properties.rxPower} dBm`;
                                    layer.bindPopup(balao);
                                }
                            }).addTo(drawnItems);
                            
                            let txMarker = L.marker(center) 
                             .bindPopup(`<b>Base/Origem</b><br>Modo: ${p.isOptical ? 'Ótico (Visual)' : 'RF'}`)
                             .addTo(drawnItems);
                             
                            rfGeneratedLayers.push(coverageLayer);
                            rfGeneratedLayers.push(txMarker);

                        } else {
                            Swal.fire('Área Bloqueada', 'O relevo bloqueia completamente a linha de visada nas configurações informadas.', 'error');
                        }
                        
                        rfTempLayer.clearLayers();
                        
                    } catch (error) {
                        handleRFError(error);
                    }
                }

                // ==========================================
                // FUNÇÕES AUXILIARES
                // ==========================================
                /**
                 * Solicita os dados de elevação para os pontos especificados.
                 * @param {Array<*>} pointsArray - Valor de entrada usado durante esta operação.
                 */
                async function requestElevation(pointsArray, allowUpload = true) {
                    const response = await window.PlanMilT.apiClient.request('elevation-profile.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ points: pointsArray })
                    });
                    const data = await response.json();

                    if (data && data.error === 'Arquivos de elevação faltando' && Array.isArray(data.missingTiles)) {
                        const missingTiles = [...new Set(data.missingTiles)];
                        const uploaded = allowUpload && await uploadMissingElevationTiles(missingTiles);
                        if (uploaded) return requestElevation(pointsArray, false);

                        const error = new Error('Arquivos de elevação faltando.');
                        error.missingTiles = missingTiles;
                        error.userCancelled = allowUpload;
                        throw error;
                    }

                    if (!response.ok) throw new Error((data && data.error) || `Falha de comunicação (HTTP ${response.status}).`);
                    if (!Array.isArray(data) || data.length !== pointsArray.length) {
                        throw new Error('Dados topográficos insuficientes.');
                    }
                    if (data.some(point => !point || typeof point.elevation !== 'number' || !Number.isFinite(point.elevation))) {
                        throw new Error('A API retornou elevações inválidas.');
                    }
                    return data;
                }

                /**
                 * Solicita os tiles ausentes e os envia ao endpoint de upload.
                 * @param {Array<string>} missingTiles - Nomes dos arquivos HGT ausentes.
                 * @returns {Promise<boolean>} Indica se os arquivos foram enviados.
                 */
                async function uploadMissingElevationTiles(missingTiles) {
                    if (missingTiles.length === 0 || missingTiles.some(tile => !/^[NS]\d{2}[EW]\d{3}\.HGT$/i.test(tile))) {
                        throw new Error('A API retornou nomes de tiles inválidos.');
                    }

                    const { isConfirmed } = await Swal.fire({
                        title: 'Arquivos de Elevação Faltando',
                        html: `Os seguintes arquivos HGT estão faltando: <b>${missingTiles.join(', ')}</b><br>Você pode obtê-los em <a href="https://www.okmap.org/en/en_srtm.aspx" target="_blank" rel="noopener">OkMap</a>.<br>Deseja fazer o upload agora?`,
                        icon: 'warning',
                        showCancelButton: true,
                        confirmButtonText: 'Fazer Upload',
                        cancelButtonText: 'Cancelar'
                    });
                    if (!isConfirmed) return false;

                    const { value: formData } = await Swal.fire({
                        title: 'Upload de Arquivos de Elevação',
                        html: `<p>Selecione os arquivos correspondentes aos tiles faltantes.</p>${missingTiles.map((tile, index) => `<label>${tile}: <input type="file" id="radio-hgt-${index}" accept=".hgt"></label><br>`).join('')}`,
                        focusConfirm: false,
                        showCancelButton: true,
                        confirmButtonText: 'Enviar',
                        cancelButtonText: 'Cancelar',
                        preConfirm: () => {
                            const uploadData = new FormData();
                            for (const [index, tile] of missingTiles.entries()) {
                                const input = document.getElementById(`radio-hgt-${index}`);
                                if (!input || !input.files || input.files.length === 0) {
                                    Swal.showValidationMessage(`Selecione o arquivo ${tile}.`);
                                    return false;
                                }
                                uploadData.append('files[]', input.files[0]);
                            }
                            uploadData.append('missingTiles', JSON.stringify(missingTiles));
                            return uploadData;
                        }
                    });
                    if (!formData) return false;

                    const uploadResponse = await window.PlanMilT.apiClient.request('elevation-upload.php', {
                        method: 'POST',
                        body: formData
                    });
                    const uploadResult = await uploadResponse.json();
                    if (!uploadResponse.ok || !uploadResult || !uploadResult.success) {
                        const error = new Error((uploadResult && uploadResult.message) || `Falha no upload (HTTP ${uploadResponse.status}).`);
                        error.userMessage = error.message;
                        throw error;
                    }

                    await Swal.fire({
                        title: 'Upload concluído',
                        text: 'Os arquivos foram enviados. O cálculo será tentado novamente.',
                        icon: 'success',
                        timer: 1800,
                        showConfirmButton: false
                    });
                    return true;
                }

                /**
                 * Apresenta e registra uma falha ocorrida durante a simulação de rádio.
                 * @param {Error} error - Erro recebido durante a operação.
                 */
                function handleRFError(error) {
                    console.error('[PlanMilT][Rádio] Falha no cálculo do enlace.', error);
                    if (!error.userCancelled) {
                        const message = error.missingTiles
                            ? `Arquivos de elevação ainda faltando: ${error.missingTiles.join(', ')}.`
                            : (error.userMessage || 'Não foi possível calcular. Verifique os arquivos HGT para esta coordenada.');
                        Swal.fire('Erro', message, 'error');
                    }
                    rfTempLayer.clearLayers();
                }

                var linkChartInstance = null;
                /**
                 * Apresenta o gráfico de perfil e indicadores do enlace calculado.
                 * @param {Array<string>} labels - Rótulos usados no eixo do gráfico.
                 * @param {Array<number>} topo - Perfil de elevação ao longo do terreno.
                 * @param {Array<number>} los - Valores calculados para a linha de visada.
                 * @param {Array<number>} fresnelLower - Limite inferior da zona de Fresnel.
                 * @param {Array<number>} fresnelUpper - Limite superior da zona de Fresnel.
                 * @param {number} freqMHz - Frequência de operação em MHz.
                 * @param {number} dist - Distância calculada para o enlace.
                 * @param {boolean} isOptical - Indica se a simulação usa o modo ótico.
                 */
                function exibirGraficoEnlace(labels, topo, los, fresnelLower, fresnelUpper, freqMHz, dist, isOptical) {
                    var container = document.getElementById('elevation-profile-container');
                    container.style.display = 'block'; 
                    var canvas = document.getElementById('elevation-profile-canvas');
                    var ctx = canvas.getContext('2d');

                    if (linkChartInstance != null) linkChartInstance.destroy();
                    if (window.currentChart != null) window.currentChart.destroy(); 

                    canvas.height = 250; 

                    let chartDatasets = [
                        { label: 'Terreno (Curvatura)', data: topo, borderColor: '#5c4033', backgroundColor: 'rgba(139, 69, 19, 0.4)', fill: true, pointRadius: 0, borderWidth: 1 },
                        { label: 'Linha de Visada', data: los, borderColor: '#0000FF', borderWidth: 2, fill: false, pointRadius: 0 }
                    ];

                    // Desenha o elipsoide de Fresnel apenas se NÃO for modo ótico
                    if (!isOptical) {
                        chartDatasets.push({ label: '-60% Fresnel (Inf)', data: fresnelLower, borderColor: '#FF0000', borderDash: [5, 5], borderWidth: 1.5, fill: false, pointRadius: 0 });
                        chartDatasets.push({ label: '+60% Fresnel (Sup)', data: fresnelUpper, borderColor: '#FF0000', borderDash: [5, 5], borderWidth: 1.5, fill: false, pointRadius: 0 });
                    }

                    let tituloGrafico = isOptical ? 
                        `Análise Ótica (Visada) - Distância: ${dist.toFixed(2)} km` : 
                        `Análise RF - Distância: ${dist.toFixed(2)} km (${freqMHz} MHz)`;

                    linkChartInstance = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: chartDatasets
                        },
                        options: {
                            maintainAspectRatio: false,
                            plugins: { title: { display: true, text: tituloGrafico }, background: { color: 'rgba(255, 255, 255, 0.9)' } },
                            scales: { y: { title: { display: true, text: 'Altitude (m)'} }, x: { ticks: { maxTicksLimit: 10 } } }
                        },
                        plugins: [{
                            id: 'background',
                            beforeDraw: (chart) => {
                                const ctx = chart.ctx;
                                ctx.save();
                                ctx.fillStyle = chart.options.plugins.background.color;
                                ctx.fillRect(0, 0, chart.width, chart.height);
                                ctx.restore();
                            }
                        }]
                    });
                }
        return Object.freeze({
            getPresets() {
                return Object.entries(radioPresets)
                    .filter(([id]) => id !== 'custom')
                    .map(([id, preset]) => Object.freeze({ id, label: preset.label }));
            },
            analyzeLink: analisarEnlaceComPreset
        });
    }
});
