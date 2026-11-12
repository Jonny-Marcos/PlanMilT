/**
 * @fileoverview Implementa simulações de enlace de rádio e visada ótica, desenha resultados e apresenta gráficos.
 * @exports window.PlanMilT.radioPlanning
 * @requires Leaflet, Turf, Chart, coveragePropagation, drawnItems e SweetAlert injetados
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
                                .rf-form .sensitivity-row { align-items: flex-start; }
                                .rf-form .sensitivity-row #rfPenetrationField { min-width: 0; }
                                @media (max-width: 520px) {
                                    .rf-form .sensitivity-row { flex-direction: column; }
                                    .rf-form .sensitivity-row .col { width: 100%; }
                                }
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
                                    <div class="row sensitivity-row">
                                        <div class="col"><label>Sensibilidade (dBm)</label><input id="rfRxSens" type="number" value="-105"></div>
                                        <div class="col" id="rfPenetrationField">
                                            <label for="rfPenetration">Penetração/Difração (cobertura RF)</label>
                                            <select id="rfPenetration">
                                                <option value="high">Alta (Otimista)</option>
                                                <option value="medium" selected>Média (Equilibrada)</option>
                                                <option value="low">Baixa (Pessimista)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                
                                <!-- PARÂMETROS GERAIS (Alturas e Raio) -->
                                <div class="row">
                                    <div class="col"><label>Altura Base / Tx (m)</label><input id="rfTxHeight" type="number" step="0.1" value="1.5"></div>
                                    <div class="col"><label>Altura Alvo / Rx (m)</label><input id="rfRxHeight" type="number" step="0.1" value="1.5"></div>
                                </div>
                                <div class="row" id="colRadius">
                                    <div class="col"><label>Raio Máx de Varredura (km)</label><input id="rfRadius" type="number" step="0.1" value="5"></div>
                                    <div class="col">
                                        <label for="rfResolution">Resolução (Precisão)</label>
                                        <select id="rfResolution">
                                            <option value="72">Pequena (Rápida) — 72 radiais</option>
                                            <option value="180" selected>Média (Padrão) — 180 radiais</option>
                                            <option value="360">Alta (Lenta) — 360 radiais</option>
                                        </select>
                                    </div>
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
                            const updatePenetrationField = () => {
                                document.getElementById('rfPenetrationField').style.display =
                                    document.getElementById('rfMode').value === 'coverage' &&
                                    document.getElementById('rfPreset').value !== 'optical' ? 'block' : 'none';
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
                                updatePenetrationField();
                            });

                            document.getElementById('rfMode').addEventListener('change', function(e) {
                                document.getElementById('colRadius').style.display = (e.target.value === 'coverage') ? 'block' : 'none';
                                updatePenetrationField();
                            });

                            document.getElementById('rfTxPower').addEventListener('input', updateWatts);
                            updateWatts();
                            updatePenetrationField();

                            document.getElementById('btnClearRFLayers').addEventListener('click', function() {
                                if(rfGeneratedLayers.length > 0) {
                                    rfGeneratedLayers.forEach(layer => {
                                        if (map.hasLayer(layer)) map.removeLayer(layer);
                                        if (drawnItems.hasLayer(layer)) drawnItems.removeLayer(layer);
                                        window.PlanMilT.coverageImage.remove(layer);
                                    });
                                    rfGeneratedLayers.length = 0;
                                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Camadas apagadas!', showConfirmButton: false, timer: 3000 });
                                } else {
                                    Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Nada para limpar.', showConfirmButton: false, timer: 2000 });
                                }
                            });
                        },
                        preConfirm: () => {
                            const values = {
                                mode: document.getElementById('rfMode').value,
                                freq: parseFloat(document.getElementById('rfFreq').value) || 0,
                                txPower: parseFloat(document.getElementById('rfTxPower').value),
                                txGain: parseFloat(document.getElementById('rfTxGain').value),
                                txHeight: parseFloat(document.getElementById('rfTxHeight').value),
                                rxGain: parseFloat(document.getElementById('rfRxGain').value),
                                rxHeight: parseFloat(document.getElementById('rfRxHeight').value),
                                rxSens: parseFloat(document.getElementById('rfRxSens').value),
                                radius: parseFloat(document.getElementById('rfRadius').value),
                                radialCount: Number(document.getElementById('rfResolution').value),
                                isOptical: (document.getElementById('rfPreset').value === 'optical'),
                                penetration: document.getElementById('rfPenetration').value
                            };
                            if (values.mode === 'coverage') {
                                if (![72, 180, 360].includes(values.radialCount)) {
                                    Swal.showValidationMessage('Selecione uma resolução de cobertura válida.');
                                    return false;
                                }
                                if (!Number.isFinite(values.radius) || values.radius <= 0 ||
                                    !Number.isFinite(values.txHeight) || values.txHeight < 0 ||
                                    !Number.isFinite(values.rxHeight) || values.rxHeight < 0) {
                                    Swal.showValidationMessage('Informe raio e alturas de antena válidos.');
                                    return false;
                                }
                                if (!values.isOptical) {
                                    if ([values.txPower, values.txGain, values.rxGain, values.rxSens].some(value => !Number.isFinite(value)) ||
                                        !['high', 'medium', 'low'].includes(values.penetration)) {
                                        Swal.showValidationMessage('Informe parâmetros RF e uma condição de penetração/difração válidos.');
                                        return false;
                                    }
                                    try { window.PlanMilT.coveragePropagation.bandForFrequency(values.freq); }
                                    catch (error) { Swal.showValidationMessage(error.message); return false; }
                                }
                            } else {
                                for (const key of ['txPower', 'txGain', 'rxGain', 'rxSens']) {
                                    if (!Number.isFinite(values[key])) values[key] = 0;
                                }
                            }
                            return values;
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
                /**
                 * Amostra o traçado geográfico de um enlace em intervalos de até 30 m.
                 * @param {Object} pt1 - Coordenada geográfica inicial.
                 * @param {Object} pt2 - Coordenada geográfica final.
                 * @returns {Object} Distância total e pontos para consulta de elevação.
                 */
                function criarPerfilEnlace(pt1, pt2) {
                    const line = turf.lineString([[pt1.lng, pt1.lat], [pt2.lng, pt2.lat]]);
                    const distTotalKm = turf.length(line, { units: 'kilometers' });
                    if (!Number.isFinite(distTotalKm) || distTotalKm <= 0) throw new Error('Os pontos do enlace devem ser distintos.');
                    const segments = Math.max(1, Math.ceil(distTotalKm / 0.03));
                    const points = [];
                    for (let i = 0; i <= segments; i++) {
                        const distKm = (i / segments) * distTotalKm;
                        const point = turf.along(line, distKm, { units: 'kilometers' });
                        points.push({ latitude: point.geometry.coordinates[1], longitude: point.geometry.coordinates[0], distKm });
                    }
                    return { points, distTotalKm };
                }

                /**
                 * Calcula obstrução, potência recebida e viabilidade com o perfil de terreno.
                 * @param {Object} profile - Distância e pontos amostrados do enlace.
                 * @param {Array<Object>} data - Elevações correspondentes aos pontos.
                 * @param {Object} p - Parâmetros do preset de rádio ou visada.
                 * @returns {Object} Métricas e dados do perfil.
                 */
                function calcularMetricasEnlace(profile, data, p) {
                    const { points, distTotalKm } = profile;
                    let hasObstruction = false;
                    let hTx = data[0].elevation + p.txHeight;
                    let hRx = data[data.length - 1].elevation + p.rxHeight;
                    let topoData = [], losData = [], fresnelDataLower = [], fresnelDataUpper = [], labels = [];
                    let freqGHz = p.isOptical ? 1 : (p.freq / 1000);

                    for (let i = 0; i < data.length; i++) {
                        let d1 = points[i].distKm;
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
                 * Analisa um enlace para os parâmetros manuais usados pela ferramenta interativa.
                 * @param {Object} pt1 - Coordenada geográfica inicial.
                 * @param {Object} pt2 - Coordenada geográfica final.
                 * @param {Object} p - Parâmetros de rádio ou visada.
                 * @returns {Promise<Object>} Resultado da análise do enlace.
                 */
                async function analisarEnlace(pt1, pt2, p) {
                    const profile = criarPerfilEnlace(pt1, pt2);
                    const data = await requestElevation(profile.points);
                    return calcularMetricasEnlace(profile, data, p);
                }

                /**
                 * Analisa vários enlaces e presets usando uma única consulta de elevação.
                 * @param {Array<Object>} links - Pares de coordenadas nas propriedades from/to.
                 * @param {Array<string>} presetIds - Identificadores dos presets.
                 * @param {number} [antennaHeight] - Altura comum em metros para Tx e Rx; sem valor mantém o preset.
                 * @returns {Promise<Object>} Resultados indexados pelo identificador do preset.
                 */
                async function analisarEnlacesComPresets(links, presetIds, antennaHeight, coverageOptions) {
                    if (!Array.isArray(links) || links.length === 0) throw new Error('Informe pelo menos um enlace para analisar.');
                    if (antennaHeight !== undefined && (!Number.isFinite(antennaHeight) || antennaHeight < 0)) {
                        throw new Error('A altura da antena deve ser um número igual ou maior que zero.');
                    }
                    const presets = presetIds.map(presetId => {
                        const preset = radioPresets[presetId];
                        if (!preset || presetId === 'custom') throw new Error('Preset de enlace inválido.');
                        return {
                            id: presetId,
                            parameters: {
                                ...preset,
                                ...(antennaHeight === undefined ? {} : { txHeight: antennaHeight, rxHeight: antennaHeight }),
                                isOptical: presetId === 'optical'
                            }
                        };
                    });
                    const profiles = links.map(link => criarPerfilEnlace(link.from, link.to));
                    const points = profiles.flatMap(profile => profile.points);
                    const elevation = await requestElevation(points);
                    let offset = 0;
                    const profileElevations = profiles.map(profile => {
                        const profileData = elevation.slice(offset, offset + profile.points.length);
                        offset += profile.points.length;
                        return profileData;
                    });

                    return Object.fromEntries(presets.map(preset => [
                        preset.id,
                        profiles.map((profile, index) => {
                            if (!coverageOptions) return calcularMetricasEnlace(profile, profileElevations[index], preset.parameters);
                            const points = profile.points.map((point, pointIndex) => ({
                                distKm: point.distKm,
                                elevation: profileElevations[index][pointIndex].elevation
                            }));
                            return {
                                ...window.PlanMilT.coveragePropagation.evaluate(points, preset.parameters, coverageOptions.penetration),
                                distTotalKm: profile.distTotalKm
                            };
                        })
                    ]));
                }

                /**
                 * Avalia um enlace com os parâmetros já usados pela ferramenta de predição.
                 * @param {Object} pt1 - Primeiro ponto geográfico do enlace.
                 * @param {Object} pt2 - Segundo ponto geográfico do enlace.
                 * @param {string} presetId - Identificador do preset de rádio ou visada.
                 * @param {number} [antennaHeight] - Altura comum em metros para Tx e Rx.
                 * @returns {Promise<Object>} Métricas de viabilidade e perfil do enlace.
                 */
                async function analisarEnlaceComPreset(pt1, pt2, presetId, antennaHeight) {
                    const results = await analisarEnlacesComPresets([{ from: pt1, to: pt2 }], [presetId], antennaHeight);
                    return results[presetId][0];
                }

                /**
                 * Analisa vários enlaces com o mesmo preset.
                 * @param {Array<Object>} links - Pares de coordenadas nas propriedades from/to.
                 * @param {string} presetId - Identificador do preset de rádio ou visada.
                 * @param {number} [antennaHeight] - Altura comum em metros para Tx e Rx.
                 * @returns {Promise<Array<Object>>} Resultados na mesma ordem dos enlaces.
                 */
                async function analisarEnlacesComPreset(links, presetId, antennaHeight, coverageOptions) {
                    const results = await analisarEnlacesComPresets(links, [presetId], antennaHeight, coverageOptions);
                    return results[presetId];
                }

                /**
                 * Calcula o limite aproximado da área de cobertura a partir de um ponto.
                 * @param {Object} center - Coordenada geográfica do ícone de origem.
                 * @param {string} presetId - Identificador do preset de rádio ou visada.
                 * @param {number} radiusKm - Alcance máximo a avaliar em quilômetros.
                 * @param {number} [antennaHeight] - Altura comum em metros para Tx e Rx.
                 * @param {Object} [options] - Resolução e quantidade de radiais da aproximação.
                 * @param {number} [options.radialCount=36] - Quantidade de direções do contorno.
                 * @param {number} [options.resolutionKm=0.1] - Intervalo de amostragem em quilômetros.
                 * @param {string} [options.penetration=medium] - Condição de penetração/difração RF.
                 * @returns {Promise<Array<Object>>} Pontos do contorno com latitude e longitude.
                 */
                async function analisarAreaCobertura(center, presetId, radiusKm, antennaHeight, options = {}) {
                    const preset = radioPresets[presetId];
                    if (!preset || presetId === 'custom') throw new Error('Preset de enlace inválido.');
                    if (!Number.isFinite(radiusKm) || radiusKm <= 0) throw new Error('Informe um alcance de cobertura válido.');
                    if (antennaHeight !== undefined && (!Number.isFinite(antennaHeight) || antennaHeight < 0)) {
                        throw new Error('A altura da antena deve ser um número igual ou maior que zero.');
                    }

                    const radialCount = options.radialCount ?? 36;
                    const resolutionKm = options.resolutionKm ?? 0.1;
                    if (!Number.isInteger(radialCount) || radialCount < 8 ||
                        !Number.isFinite(resolutionKm) || resolutionKm <= 0) {
                        throw new Error('Parâmetros inválidos para calcular a área de cobertura.');
                    }

                    const steps = Math.ceil(radiusKm / resolutionKm);
                    const points = [];
                    for (let radialIndex = 0; radialIndex < radialCount; radialIndex++) {
                        const bearing = radialIndex * 360 / radialCount;
                        for (let step = 0; step <= steps; step++) {
                            const distanceKm = Math.min(step * resolutionKm, radiusKm);
                            const destination = turf.destination(
                                [center.lng, center.lat],
                                distanceKm,
                                bearing,
                                { units: 'kilometers' }
                            ).geometry.coordinates;
                            points.push({
                                latitude: destination[1],
                                longitude: destination[0],
                                distKm: distanceKm,
                                radialIndex
                            });
                        }
                    }

                    const elevations = await requestElevation(points);
                    const parameters = {
                        ...preset,
                        ...(antennaHeight === undefined ? {} : { txHeight: antennaHeight, rxHeight: antennaHeight }),
                        isOptical: presetId === 'optical'
                    };
                    const boundary = [];
                    for (let radialIndex = 0; radialIndex < radialCount; radialIndex++) {
                        const radialOffset = radialIndex * (steps + 1);
                        let furthestViableDistance = 0;
                        const profile = [{ distKm: 0, elevation: elevations[radialOffset].elevation }];

                        for (let step = 1; step <= steps; step++) {
                            const pointIndex = radialOffset + step;
                            const distanceKm = points[pointIndex].distKm;
                            profile.push({ distKm: distanceKm, elevation: elevations[pointIndex].elevation });
                            const result = window.PlanMilT.coveragePropagation.evaluate(profile, parameters, options.penetration);
                            if (result.isViable) furthestViableDistance = distanceKm;
                        }

                        const destination = turf.destination(
                            [center.lng, center.lat],
                            furthestViableDistance,
                            radialIndex * 360 / radialCount,
                            { units: 'kilometers' }
                        ).geometry.coordinates;
                        boundary.push({ lat: destination[1], lng: destination[0] });
                    }
                    return boundary;
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
                 * Apresenta a etapa atual da predição de cobertura.
                 * @param {string} message - Descrição da etapa.
                 * @param {number} radialCount - Quantidade de radiais.
                 */
                function showCoverageProgress(message, radialCount) {
                    Swal.fire({
                        title: 'Predição de área de cobertura',
                        html: `<p id="coverageProgressMessage"></p><progress id="coverageProgress" max="${radialCount}" aria-label="Radiais analisadas"></progress><p id="coverageProgressEstimate" aria-live="polite"></p>`,
                        showConfirmButton: false,
                        allowOutsideClick: false,
                        allowEscapeKey: false,
                        didOpen: () => { document.getElementById('coverageProgressMessage').textContent = message; }
                    });
                }

                /**
                 * Libera o navegador para atualizar a interface durante o cálculo.
                 * @returns {Promise<void>} Espera até a próxima tarefa do navegador.
                 */
                function yieldCoverageProgress() {
                    return new Promise(resolve => setTimeout(resolve, 0));
                }

                /**
                 * Calcula a cobertura RF a partir do centro e dos parâmetros da simulação.
                 * @param {Object} center - Centro geográfico da forma ou simulação.
                 * @param {Object} p - Parâmetros de configuração da simulação.
                 */
                async function calcularCobertura(center, p) {
                    try {
                        const { radialCount: radiais, resolutionKm: resolucaoKm, steps: maxPassos } = window.PlanMilT.coverageImage.resolution(p.radius, p.radialCount);
                        showCoverageProgress('Preparando os pontos de análise…', radiais);
                        await yieldCoverageProgress();
                        let raster;
                        try {
                            raster = window.PlanMilT.coverageImage.createRaster({ center, radius: p.radius, turf, document });
                        } catch (error) {
                            error.userMessage = error.message;
                            throw error;
                        }
                        document.getElementById('coverageProgressMessage').textContent = `Preparando os pontos de análise (resolução radial: ${resolucaoKm.toPrecision(3)} km)…`;
                        let pointReqArray = [];
                        
                        for (let r = 0; r < radiais; r++) {
                            let angle = (360 / radiais) * r;
                            for (let i = 0; i <= maxPassos; i++) {
                                let dist = Math.min(i * resolucaoKm, p.radius);
                                let dest = turf.destination([center.lng, center.lat], dist, angle, {units: 'kilometers'});
                                pointReqArray.push({ latitude: dest.geometry.coordinates[1], longitude: dest.geometry.coordinates[0], distKm: dist, angle: angle, radialId: r });
                            }
                            if (r % 4 === 3) await yieldCoverageProgress();
                        }

                        document.getElementById('coverageProgressMessage').textContent = 'Consultando a elevação do terreno; tempo restante indisponível nesta etapa…';
                        await yieldCoverageProgress();
                        const data = await requestElevation(pointReqArray, true, () => {
                            showCoverageProgress('Consultando novamente a elevação do terreno; tempo restante indisponível nesta etapa…', radiais);
                        });
                        if (!data || data.length !== pointReqArray.length) throw new Error("Dados topográficos insuficientes.");

                        showCoverageProgress('Calculando a cobertura do terreno…', radiais);
                        const progressBar = document.getElementById('coverageProgress');
                        const progressMessage = document.getElementById('coverageProgressMessage');
                        const progressEstimate = document.getElementById('coverageProgressEstimate');
                        const calculationStart = Date.now();
                        progressBar.value = 0;
                        await yieldCoverageProgress();
                        let validCells = 0;
                        const powerSamples = p.isOptical ? null : window.PlanMilT.coverageImage.createPowerSamples(center, p.radius, radiais, maxPassos);
                        let halfAngle = (360 / radiais) / 2;
                        let halfDist = resolucaoKm / 2;
                        
                        for (let r = 0; r < radiais; r++) {
                            const startIdx = r * (maxPassos + 1);
                            const profile = [{ distKm: 0, elevation: data[startIdx].elevation }];

                            for (let i = 1; i <= maxPassos; i++) {
                                let idx = startIdx + i;
                                let d1 = pointReqArray[idx].distKm;
                                
                                if (d1 === 0) continue; 

                                profile.push({ distKm: d1, elevation: data[idx].elevation });
                                const result = window.PlanMilT.coveragePropagation.evaluate(profile, p, p.penetration);
                                if (!result.isViable) continue;
                                const rxPower = result.rxPower;
                                if (powerSamples) powerSamples.set(r, i, rxPower);

                                let currentPoint = pointReqArray[idx];
                                let dist1 = i === 1 ? 0 : currentPoint.distKm - halfDist;
                                let dist2 = Math.min(p.radius, currentPoint.distKm + halfDist);
                                let angle1 = currentPoint.angle - halfAngle;
                                let angle2 = currentPoint.angle + halfAngle;

                                let p1 = turf.destination([center.lng, center.lat], dist1, angle1, {units: 'kilometers'}).geometry.coordinates;
                                let p2 = turf.destination([center.lng, center.lat], dist2, angle1, {units: 'kilometers'}).geometry.coordinates;
                                let p3 = turf.destination([center.lng, center.lat], dist2, angle2, {units: 'kilometers'}).geometry.coordinates;
                                let p4 = turf.destination([center.lng, center.lat], dist1, angle2, {units: 'kilometers'}).geometry.coordinates;

                                let cellColor = p.isOptical ? '#ffff00' : window.PlanMilT.coverageImage.signalColor(rxPower, p.rxSens);

                                raster.draw([p1, p2, p3, p4], cellColor, p.isOptical ? 0.45 : 0.6);
                                validCells++;
                            }
                            const completed = r + 1;
                            progressBar.value = completed;
                            progressMessage.textContent = `Analisando radiais: ${completed} de ${radiais} (${Math.round(completed / radiais * 100)}%).`;
                            if (completed < radiais) {
                                const remainingSeconds = Math.ceil((Date.now() - calculationStart) / 1000 / completed * (radiais - completed));
                                progressEstimate.textContent = `Tempo estimado para as radiais: ${remainingSeconds} s. A exibição do resultado ainda será processada.`;
                            } else {
                                progressEstimate.textContent = 'Preparando a exibição do resultado…';
                            }
                            await yieldCoverageProgress();
                        }

                        if (validCells > 0) {
                            const result = raster.finish();
                            const coverageLayer = window.PlanMilT.coverageImage.add({
                                type: 'Feature',
                                geometry: null,
                                properties: { coverageImage: {
                                    image: result.image,
                                    mapImage: result.mapImage,
                                    bounds: result.bounds,
                                    resolutionKm: resolucaoKm,
                                    mode: p.isOptical ? 'optical' : 'radio',
                                    ...(powerSamples ? { powerSamples: powerSamples.serialize() } : {})
                                } }
                            }, L);
                            
                            let txMarker = L.marker(center) 
                             .bindPopup(`<b>Base/Origem</b><br>Modo: ${p.isOptical ? 'Ótico (Visual)' : 'RF'}${p.isOptical ? '' : `<br>Faixa: ${window.PlanMilT.coveragePropagation.bandForFrequency(p.freq).name}<br>Penetração/Difração: ${{ high: 'Alta (Otimista)', medium: 'Média (Equilibrada)', low: 'Baixa (Pessimista)' }[p.penetration || 'medium']}`}`)
                             .addTo(drawnItems);
                             
                            rfGeneratedLayers.push(coverageLayer);
                            rfGeneratedLayers.push(txMarker);
                            Swal.close();

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
                 * @param {boolean} [allowUpload=true] - Permite solicitar arquivos ausentes.
                 * @param {Function} [onResume] - Atualiza a interface antes de repetir a consulta.
                 * @returns {Promise<Array<Object>>} Elevações dos pontos consultados.
                 */
                async function requestElevation(pointsArray, allowUpload = true, onResume) {
                    const response = await window.PlanMilT.apiClient.request('elevation-profile.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ points: pointsArray.map(({ latitude, longitude }) => ({ latitude, longitude })) })
                    });
                    const data = await response.json();

                    if (data && data.error === 'Arquivos de elevação faltando' && Array.isArray(data.missingTiles)) {
                        const missingTiles = [...new Set(data.missingTiles)];
                        const uploaded = allowUpload && await window.PlanMilT.elevationFiles.ensure(missingTiles);
                        if (uploaded) {
                            if (onResume) onResume();
                            return requestElevation(pointsArray, false, onResume);
                        }

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
            /**
             * Lista os presets de rádio e visada que podem ser usados pelas tarefas.
             * @returns {Array<Object>} Identificador e rótulo de cada preset.
             */
            getPresets() {
                return Object.entries(radioPresets)
                    .filter(([id]) => id !== 'custom')
                    .map(([id, preset]) => Object.freeze({ id, label: preset.label }));
            },
            analyzeLink: analisarEnlaceComPreset,
            analyzeLinks: analisarEnlacesComPreset,
            analyzeCoverageBoundary: analisarAreaCobertura,
            /**
             * Compara todos os presets disponíveis sobre os mesmos perfis de elevação.
             * @param {Array<Object>} links - Pares de coordenadas nas propriedades from/to.
             * @param {number} [antennaHeight] - Altura comum em metros para Tx e Rx.
             * @returns {Promise<Object>} Resultados indexados pelo identificador do preset.
             */
            compareLinks(links, antennaHeight) {
                const presetIds = Object.keys(radioPresets).filter(id => id !== 'custom');
                return analisarEnlacesComPresets(links, presetIds, antennaHeight);
            }
        });
    }
});
