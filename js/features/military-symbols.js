/**
 * @fileoverview Cria símbolos militares APP-6/MIL-STD, conserva modelos locais e edita marcadores.
 * @exports window.PlanMilT.militarySymbols
 * @requires milsymbol, milstandard-e, Leaflet e SweetAlert2
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.militarySymbols = (() => {
    const storageKey = `planmilt.military-symbols.v1:${new URL('.', window.location.href).pathname}`;
    const fields = ['uniqueDesignation', 'higherFormation', 'additionalInformation', 'staffComments', 'quantity',
        'type', 'location', 'dtg', 'altitudeDepth', 'speed', 'reinforcedReduced', 'specialDesignator',
        'specialHeadquarters', 'combatEffectiveness', 'evaluationRating', 'iffSif', 'signatureEquipment', 'platformType'];
    const labels = {
        uniqueDesignation: 'Designação', higherFormation: 'Escalão superior',
        additionalInformation: 'Informações adicionais', staffComments: 'Observações',
        quantity: 'Quantidade', type: 'Tipo', location: 'Localização', dtg: 'Data e hora',
        altitudeDepth: 'Altitude / profundidade', speed: 'Velocidade', reinforcedReduced: 'Reforçado / reduzido',
        specialDesignator: 'Designação especial', specialHeadquarters: 'Comando especial',
        combatEffectiveness: 'Efetividade de combate', evaluationRating: 'Avaliação', iffSif: 'IFF / SIF',
        signatureEquipment: 'Assinatura do equipamento', platformType: 'Tipo de plataforma'
    };
    const defaultConfig = { sidc: '13031000141211000000', options: {} };

    /**
     * Valida e normaliza os dados editáveis antes de desenhar ou guardar.
     * @param {Object} config - SIDC e campos textuais do símbolo.
     * @returns {Object} Configuração normalizada.
     */
    function normalize(config) {
        if (!config || typeof config.sidc !== 'string' || !/^(?:\d{20}|\d{30})$/.test(config.sidc) ||
            !config.options || typeof config.options !== 'object') {
            throw new Error('Informe um SIDC numérico de 20 ou 30 dígitos.');
        }
        const options = {};
        for (const field of fields) {
            const value = config.options[field] || '';
            if (typeof value !== 'string' || value.length > 50) throw new Error('Os campos de texto aceitam até 50 caracteres.');
            options[field] = value;
        }
        return { sidc: config.sidc, options };
    }

    /**
     * Gera uma imagem autocontida e as dimensões de posicionamento do símbolo.
     * @param {Object} config - Configuração editável.
     * @returns {Object} Dados persistíveis do símbolo.
     */
    function render(config) {
        const normalized = normalize(config);
        const symbol = new window.ms.Symbol(normalized.sidc, { ...normalized.options, size: 35 });
        if (!symbol.isValid()) throw new Error('SIDC ou combinação de modificadores não reconhecida pela biblioteca.');
        const size = symbol.getSize();
        const anchor = symbol.getAnchor();
        return {
            config: normalized, iconUrl: symbol.toDataURL(),
            iconSize: [size.width, size.height], iconAnchor: [anchor.x, anchor.y]
        };
    }

    /**
     * Cria um ícone Leaflet com as dimensões de um símbolo salvo.
     * @param {Object} data - Imagem e dimensões persistidas.
     * @param {Object} leaflet - Biblioteca Leaflet.
     * @returns {Object} Ícone Leaflet.
     */
    function createIcon(data, leaflet) {
        if (!data || typeof data.iconUrl !== 'string' || !Array.isArray(data.iconSize) ||
            !Array.isArray(data.iconAnchor) || data.iconSize.length !== 2 || data.iconAnchor.length !== 2 ||
            !data.iconSize.every(value => Number.isFinite(value) && value > 0) ||
            !data.iconAnchor.every(Number.isFinite)) {
            throw new Error('Dados da calunga inválidos.');
        }
        return leaflet.icon({ iconUrl: data.iconUrl, iconSize: data.iconSize, iconAnchor: data.iconAnchor });
    }

    /**
     * Lê modelos reutilizáveis deste navegador.
     * @returns {Array<Object>} Modelos locais.
     */
    function readLibrary() {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return [];
        const entries = JSON.parse(raw);
        if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.id !== 'string' ||
            typeof entry.name !== 'string' || !entry.name || entry.name.length > 80)) {
            throw new Error('Biblioteca de calungas inválida.');
        }
        return entries.map(entry => ({ id: entry.id, name: entry.name, config: normalize(entry.config) }));
    }

    /**
     * Grava modelos sem afetar os símbolos já inseridos no mapa.
     * @param {Array<Object>} entries - Modelos a guardar.
     */
    function writeLibrary(entries) {
        localStorage.setItem(storageKey, JSON.stringify(entries));
    }

    /**
     * Apresenta o criador e retorna o símbolo confirmado.
     * @param {Object} [initial] - Configuração anterior, se houver.
     * @param {boolean} [editing=false] - Indica edição de marcador existente.
     * @returns {Promise<Object|null>} Símbolo criado ou null ao cancelar.
     */
    async function open(initial = defaultConfig, editing = false) {
        const sets = window.milstd2525.ms2525e;
        let current = normalize(initial);
        let library = [];
        let storageError = '';
        try {
            library = readLibrary();
        } catch (error) {
            console.error('[PlanMilT][Calungas] Falha ao ler biblioteca local.', error);
            storageError = 'Não foi possível acessar a biblioteca local de calungas.';
        }
        const result = await Swal.fire({
            title: editing ? 'Editar calunga' : 'Criar calunga',
            customClass: { popup: 'military-symbol-modal' },
            html: `<style>
.swal2-popup.military-symbol-modal{width:min(820px,calc(100vw - 28px))!important;padding:20px!important}
#militarySymbolEditor{font:14px/1.45 sans-serif;text-align:left;color:#27364a}
#militarySymbolEditor .symbol-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
#militarySymbolEditor label{display:block;font-weight:600;margin-bottom:4px}
#militarySymbolEditor input,#militarySymbolEditor select{box-sizing:border-box;width:100%;height:40px;margin:0;padding:6px;border:1px solid #c5cad2;border-radius:6px;font:inherit}
#militarySymbolEditor .symbol-preview{min-height:110px;display:flex;align-items:center;justify-content:center;overflow:auto;background:#f4f6f9;border:1px solid #d3d8e0;border-radius:6px;margin:12px 0}
#militarySymbolEditor .symbol-preview img{max-width:100%;height:auto}
#militarySymbolEditor details{margin:12px 0} #militarySymbolEditor summary{cursor:pointer;font-weight:600}
#militarySymbolEditor .symbol-library{display:flex;gap:8px;flex-wrap:wrap;align-items:end}
#militarySymbolEditor .symbol-library > div{flex:1 1 180px}
#militarySymbolEditor button{min-height:40px;padding:8px;border:1px solid #435f88;border-radius:6px;background:#fff;cursor:pointer}
#militarySymbolEditor [role=status]{color:#a00000}
@media(max-width:600px){#militarySymbolEditor .symbol-grid{grid-template-columns:1fr}}
</style><div id="militarySymbolEditor">
<p>Personalize um símbolo MIL-STD-2525E/APP-6. Os nomes técnicos do catálogo estão em inglês; não há garantia de equivalência à doutrina brasileira.</p>
<div class="symbol-grid">
<div><label for="symbolSet">Categoria</label><select id="symbolSet"></select></div>
<div><label for="symbolSearch">Buscar tipo (inglês)</label><input id="symbolSearch" type="search" placeholder="Ex.: infantry"></div>
<div><label for="symbolEntity">Tipo de símbolo</label><select id="symbolEntity"></select></div>
<div><label for="symbolAffiliation">Afiliação</label><select id="symbolAffiliation"><option value="3">Amigo</option><option value="6">Inimigo</option><option value="4">Neutro</option><option value="1">Desconhecido</option></select></div>
<div><label for="symbolEchelon">Escalão / mobilidade (código)</label><select id="symbolEchelon">
<option value="00">Não especificado</option><option value="11">Equipe</option><option value="12">Grupo</option><option value="13">Seção</option><option value="14">Pelotão</option><option value="15">Companhia</option><option value="16">Batalhão</option><option value="17">Regimento</option><option value="18">Brigada</option><option value="21">Divisão</option><option value="22">Corpo</option><option value="23">Exército</option><option value="24">Grupo de exércitos</option><option value="25">Região / teatro</option><option value="26">Comando</option>
</select></div>
<div><label for="symbolStatus">Situação</label><select id="symbolStatus"><option value="0">Presente</option><option value="1">Planejado</option><option value="2">Operacional</option><option value="3">Danificado</option><option value="4">Destruído</option><option value="5">Capacidade máxima</option></select></div>
<div><label for="symbolHeadquarters">Comando / força-tarefa / dissimulação</label><select id="symbolHeadquarters"><option value="0">Nenhum</option><option value="1">Dissimulação</option><option value="2">Comando</option><option value="3">Comando em dissimulação</option><option value="4">Força-tarefa</option><option value="5">Força-tarefa em dissimulação</option><option value="6">Comando de força-tarefa</option><option value="7">Comando de força-tarefa em dissimulação</option></select></div>
<div><label for="symbolModifier1">Modificador 1 (inglês)</label><select id="symbolModifier1"></select></div>
<div><label for="symbolModifier2">Modificador 2 (inglês)</label><select id="symbolModifier2"></select></div>
</div>
<details><summary>SIDC e informações adicionais</summary>
<p>O SIDC numérico permite usar outras combinações suportadas pela biblioteca. Ao mudar os seletores, os respectivos campos do SIDC serão atualizados.</p>
<label for="symbolSidc">SIDC (20 ou 30 dígitos)</label><input id="symbolSidc" maxlength="30" inputmode="numeric">
<div class="symbol-grid">${fields.map(field => `<div><label for="symbol-${field}">${labels[field]}</label><input id="symbol-${field}" maxlength="50"></div>`).join('')}</div>
</details>
<div class="symbol-preview"><img id="symbolPreview" alt="Prévia da calunga"></div>
<p id="symbolError" role="status"></p>
<details><summary>Biblioteca neste navegador</summary>
<p>Modelos ficam somente neste navegador e podem ser apagados ao limpar seus dados. Excluir um modelo não remove símbolos do mapa.</p>
<div class="symbol-library"><div><label for="symbolLibrary">Modelos salvos</label><select id="symbolLibrary"></select></div>
<button id="symbolLoad" type="button">Carregar</button><button id="symbolDelete" type="button">Excluir</button></div>
<div class="symbol-library"><div><label for="symbolName">Nome do modelo</label><input id="symbolName" maxlength="80"></div><button id="symbolSave" type="button">Salvar modelo</button></div>
<p id="symbolStorageError" role="status"></p></details></div>`,
            showCancelButton: true,
            confirmButtonText: editing ? 'Aplicar alterações' : 'Selecionar para inserir',
            cancelButtonText: 'Cancelar',
            didOpen: () => {
                const get = id => document.getElementById(id);
                const set = get('symbolSet');
                const entity = get('symbolEntity');
                const sidc = get('symbolSidc');
                const preview = get('symbolPreview');
                const errorText = get('symbolError');
                const librarySelect = get('symbolLibrary');
                const storageStatus = get('symbolStorageError');
                storageStatus.textContent = storageError;

                /** @param {HTMLElement} select - Seletor. @param {string} value - Código. @param {string} text - Rótulo. */
                function addOption(select, value, text) {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = text;
                    select.appendChild(option);
                }
                /** Atualiza a prévia e mantém erros visíveis no formulário. */
                function updatePreview() {
                    try {
                        current = { sidc: sidc.value.trim(), options: Object.fromEntries(fields.map(field => [field, get(`symbol-${field}`).value])) };
                        preview.src = render(current).iconUrl;
                        errorText.textContent = '';
                    } catch (error) {
                        preview.removeAttribute('src');
                        errorText.textContent = error.message;
                    }
                }
                /** Atualiza a lista de tipos e modificadores da categoria. */
                function fillCatalog() {
                    const catalog = sets[set.value];
                    entity.replaceChildren();
                    const query = get('symbolSearch').value.toLowerCase().trim();
                    for (const entry of catalog.mainIcon) {
                        const name = [entry.Entity, entry['Entity Type'], entry['Entity Subtype']].filter(Boolean).join(' / ');
                        if (/^\d{6}$/.test(entry.Code) && (!query || `${name} ${entry.Code}`.toLowerCase().includes(query))) {
                            addOption(entity, entry.Code, `${name} (${entry.Code})`);
                        }
                    }
                    entity.value = sidc.value.slice(10, 16);
                    for (const [id, key, label] of [['symbolModifier1', 'modifier1', 'First Modifier'], ['symbolModifier2', 'modifier2', 'Second Modifier']]) {
                        const select = get(id);
                        select.replaceChildren();
                        addOption(select, '000', 'Nenhum');
                        const seen = new Set(['000']);
                        for (const item of [...catalog[key], ...sets.common[key]]) {
                            if (/^\d{2,3}$/.test(item.Code) && !seen.has(item.Code.padStart(3, '0'))) {
                                const code = item.Code.padStart(3, '0');
                                seen.add(code);
                                addOption(select, code, `${item[label]} (${item.Code})`);
                            }
                        }
                        const first = id === 'symbolModifier1';
                        select.value = (sidc.value[first ? 20 : 21] || '0') + sidc.value.slice(first ? 16 : 18, first ? 18 : 20);
                    }
                }
                /** Preenche os controles a partir do SIDC, sem modificar seu conteúdo. */
                function fillFromConfig(config) {
                    sidc.value = config.sidc;
                    for (const field of fields) get(`symbol-${field}`).value = config.options[field] || '';
                    set.value = config.sidc.slice(4, 6);
                    if (!set.value) set.value = '10';
                    get('symbolAffiliation').value = config.sidc.slice(3, 4);
                    get('symbolStatus').value = config.sidc.slice(6, 7);
                    get('symbolHeadquarters').value = config.sidc.slice(7, 8);
                    get('symbolEchelon').value = config.sidc.slice(8, 10);
                    fillCatalog();
                    updatePreview();
                }
                /** Atualiza parte do SIDC preservando os demais campos. */
                function replaceSidc(start, length, value) {
                    if (!value || !/^(?:\d{20}|\d{30})$/.test(sidc.value)) return;
                    sidc.value = sidc.value.slice(0, start) + value + sidc.value.slice(start + length);
                    updatePreview();
                }
                /** @param {boolean} first - Indica o setor do modificador. @param {string} value - Código de três dígitos. */
                function replaceModifier(first, value) {
                    if (!/^\d{3}$/.test(value) || !/^(?:\d{20}|\d{30})$/.test(sidc.value)) return;
                    let code = sidc.value;
                    if (code.length === 20 && value[0] !== '0') code = code.padEnd(30, '0');
                    const position = first ? 16 : 18;
                    code = code.slice(0, position) + value.slice(1) + code.slice(position + 2);
                    if (code.length === 30) {
                        const prefix = first ? 20 : 21;
                        code = code.slice(0, prefix) + value[0] + code.slice(prefix + 1);
                    }
                    sidc.value = code;
                    updatePreview();
                }
                /** Recria a lista dos modelos salvos. */
                function fillLibrary() {
                    librarySelect.replaceChildren();
                    addOption(librarySelect, '', 'Selecione um modelo');
                    for (const entry of library) addOption(librarySelect, entry.id, entry.name);
                }
                for (const [code, catalog] of Object.entries(sets)) {
                    if (code !== 'common') addOption(set, code, `${catalog.name} (${code})`);
                }
                fillLibrary();
                fillFromConfig(current);
                set.addEventListener('change', () => {
                    replaceSidc(4, 2, set.value);
                    fillCatalog();
                    if (entity.options.length) {
                        entity.selectedIndex = 0;
                        replaceSidc(10, 6, entity.value);
                    }
                    get('symbolModifier1').value = '000';
                    get('symbolModifier2').value = '000';
                    replaceModifier(true, '000');
                    replaceModifier(false, '000');
                });
                get('symbolSearch').addEventListener('input', fillCatalog);
                for (const [id, start, length] of [['symbolEntity', 10, 6], ['symbolAffiliation', 3, 1],
                    ['symbolEchelon', 8, 2], ['symbolStatus', 6, 1], ['symbolHeadquarters', 7, 1]]) {
                    get(id).addEventListener('change', event => replaceSidc(start, length, event.target.value));
                }
                get('symbolModifier1').addEventListener('change', event => replaceModifier(true, event.target.value));
                get('symbolModifier2').addEventListener('change', event => replaceModifier(false, event.target.value));
                sidc.addEventListener('input', () => {
                    if (/^(?:\d{20}|\d{30})$/.test(sidc.value)) fillFromConfig({ sidc: sidc.value, options: Object.fromEntries(fields.map(field => [field, get(`symbol-${field}`).value])) });
                    else updatePreview();
                });
                for (const field of fields) get(`symbol-${field}`).addEventListener('input', updatePreview);
                get('symbolLoad').addEventListener('click', () => {
                    const entry = library.find(item => item.id === librarySelect.value);
                    if (!entry) { storageStatus.textContent = 'Selecione um modelo.'; return; }
                    get('symbolSearch').value = '';
                    get('symbolName').value = entry.name;
                    fillFromConfig(entry.config);
                    storageStatus.textContent = '';
                });
                get('symbolSave').addEventListener('click', () => {
                    try {
                        const name = get('symbolName').value.trim();
                        if (!name) throw new Error('Informe um nome para o modelo.');
                        const data = render(current);
                        const entries = readLibrary();
                        const existing = entries.find(item => item.name === name);
                        const item = { id: existing ? existing.id : `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, config: data.config };
                        writeLibrary([item, ...entries.filter(entry => entry.id !== item.id)]);
                        library = readLibrary();
                        fillLibrary();
                        librarySelect.value = item.id;
                        storageStatus.textContent = 'Modelo salvo neste navegador.';
                    } catch (error) {
                        console.error('[PlanMilT][Calungas] Falha ao salvar modelo.', error);
                        storageStatus.textContent = `Não foi possível salvar o modelo: ${error.message}`;
                    }
                });
                get('symbolDelete').addEventListener('click', () => {
                    try {
                        if (!librarySelect.value) throw new Error('Selecione um modelo.');
                        const entries = readLibrary().filter(entry => entry.id !== librarySelect.value);
                        writeLibrary(entries);
                        library = entries;
                        fillLibrary();
                        storageStatus.textContent = 'Modelo excluído.';
                    } catch (error) {
                        console.error('[PlanMilT][Calungas] Falha ao excluir modelo.', error);
                        storageStatus.textContent = `Não foi possível excluir o modelo: ${error.message}`;
                    }
                });
            },
            preConfirm: () => {
                try {
                    return render({ sidc: document.getElementById('symbolSidc').value.trim(),
                        options: Object.fromEntries(fields.map(field => [field, document.getElementById(`symbol-${field}`).value])) });
                } catch (error) {
                    Swal.showValidationMessage(error.message);
                    return false;
                }
            }
        });
        return result.isConfirmed ? result.value : null;
    }

    /**
     * Abre o editor e atualiza somente o marcador escolhido.
     * @param {Object} layer - Marcador editável do planejamento.
     * @param {Object} leaflet - Biblioteca Leaflet.
     */
    async function edit(layer, leaflet) {
        const data = await open(layer.feature.properties.militarySymbol.config, true);
        if (!data) return;
        layer.setIcon(createIcon(data, leaflet));
        layer.feature.properties.militarySymbol = data;
        layer.feature.properties.iconUrl = data.iconUrl;
    }

    return Object.freeze({ open, edit, render, createIcon });
})();
