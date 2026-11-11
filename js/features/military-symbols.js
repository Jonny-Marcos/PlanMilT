/**
 * @fileoverview Cria símbolos militares brasileiros, conserva modelos locais e edita marcadores.
 * @exports window.PlanMilT.militarySymbols
 * @requires gerador e catálogo brasileiros locais, Leaflet e SweetAlert2
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.militarySymbols = (() => {
    const storageKey = `planmilt.military-symbols.br.v1:${new URL('.', window.location.href).pathname}`;
    const amplifierFields = ['uniqueDesignation', 'higherFormation', 'staffComments', 'dtg',
        'hostile', 'location', 'altitudeDepth', 'speed'];
    const otherFields = ['additionalInformation', 'quantity',
        'type', 'reinforcedReduced', 'specialDesignator',
        'specialHeadquarters', 'combatEffectiveness', 'evaluationRating', 'iffSif', 'signatureEquipment', 'platformType'];
    const fields = [...amplifierFields, ...otherFields];
    const labels = {
        uniqueDesignation: 'Designação', higherFormation: 'Subordinação',
        additionalInformation: 'Informações complementares', staffComments: 'Informações adicionais',
        hostile: 'Credibilidade', quantity: 'Quantidade', type: 'Tipo', location: 'Localização', dtg: 'GDH (grupo data-hora)',
        altitudeDepth: 'Altitude / profundidade', speed: 'Velocidade', reinforcedReduced: 'Reforçado / reduzido',
        specialDesignator: 'Designação especial', specialHeadquarters: 'Comando especial',
        combatEffectiveness: 'Efetividade de combate', evaluationRating: 'Avaliação', iffSif: 'IFF / SIF',
        signatureEquipment: 'Assinatura do equipamento', platformType: 'Tipo de plataforma'
    };
    const defaultConfig = { sidc: '10031000001211000000', options: {} };

    /**
     * Normaliza a busca sem distinguir maiúsculas ou acentos.
     * @param {string} text - Texto a normalizar.
     * @returns {string} Texto normalizado.
     */
    function searchText(text) {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

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
        const symbol = new window.PlanMilTBrazilian.ms.Symbol(normalized.sidc, { ...normalized.options, size: 35 });
        const code = normalized.sidc;
        const category = window.PlanMilT.brazilianSymbolCatalog[code.slice(4, 6)];
        if (!category) throw new Error('Categoria de calunga não disponível no catálogo brasileiro.');
        if (code.length === 30 && code.slice(20, 23) !== '076') {
            throw new Error('Informe uma extensão brasileira de SIDC.');
        }
        if (code.length === 30) {
            const bits = Number(code.slice(23));
            if (bits >= 2 ** 19) throw new Error('Extensão brasileira de SIDC inválida.');
            const extensions = window.PlanMilTBrazilian.extensions[code.slice(4, 6)];
            for (const [name, value] of [
                ['ModificadorTransversal', (bits >> 10) & 7],
                ['Modificador1', (bits >> 5) & 31],
                ['Modificador2', bits & 31]
            ]) {
                if (value && (!extensions || !extensions[name] || !extensions[name][value])) {
                    throw new Error('Modificador brasileiro não reconhecido para esta categoria.');
                }
            }
        }
        const entityExtension = value => value.length === 30 && value.slice(20, 23) === '076'
            ? (Number(value.slice(23)) >> 14) & 31 : 0;
        const knownBrazilianEntity = code.length === 30 && code.slice(20, 23) === '076' && category &&
            [...category.icons, ...category.examples].some(item => item.sidc.slice(10, 16) === code.slice(10, 16) &&
                entityExtension(item.sidc) === entityExtension(code));
        if (!symbol.isValid() && !knownBrazilianEntity) {
            throw new Error('SIDC ou combinação de modificadores não reconhecida pela biblioteca.');
        }
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
        const sets = window.PlanMilT.brazilianSymbolCatalog;
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
#militarySymbolEditor fieldset{margin:12px 0;padding:12px;border:1px solid #d3d8e0;border-radius:6px}
#militarySymbolEditor legend{font-weight:600}
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
<p>Personalize uma calunga com o gerador e catálogo do Portal de Simbologia Militar.</p>
<div class="symbol-grid">
<div><label for="symbolSet">Categoria</label><select id="symbolSet"></select></div>
<div><label for="symbolCatalog">Catálogo</label><select id="symbolCatalog"><option value="icons">Ícones centrais</option><option value="examples">Exemplos doutrinários</option></select></div>
<div><label for="symbolSearch">Buscar tipo</label><input id="symbolSearch" type="search" placeholder="Ex.: infantaria"></div>
<div><label for="symbolEntity">Tipo de símbolo</label><select id="symbolEntity"></select></div>
<div><label for="symbolAffiliation">Afiliação</label><select id="symbolAffiliation"><option value="3">Amigo</option><option value="6">Inimigo</option><option value="4">Neutro</option><option value="1">Desconhecido</option></select></div>
<div><label for="symbolEchelon">Escalão / mobilidade (código)</label><select id="symbolEchelon">
<option value="00">Não especificado</option><option value="11">Equipe / guarnição</option><option value="12">Esquadra</option><option value="13">Seção</option><option value="14">Pelotão</option><option value="15">Companhia</option><option value="16">Batalhão</option><option value="17">Regimento</option><option value="18">Brigada</option><option value="21">Divisão</option><option value="22">Corpo</option><option value="23">Exército</option><option value="24">Grupo de exércitos</option><option value="25">Região / teatro</option><option value="26">Comando</option>
</select></div>
<div><label for="symbolStatus">Situação</label><select id="symbolStatus"><option value="0">Presente</option><option value="1">Planejado</option><option value="2">Operacional</option><option value="3">Danificado</option><option value="4">Destruído</option><option value="5">Capacidade máxima</option></select></div>
<div><label for="symbolHeadquarters">Comando / força-tarefa / dissimulação</label><select id="symbolHeadquarters"><option value="0">Nenhum</option><option value="1">Dissimulação</option><option value="2">Comando</option><option value="3">Comando em dissimulação</option><option value="4">Força-tarefa</option><option value="5">Força-tarefa em dissimulação</option><option value="6">Comando de força-tarefa</option><option value="7">Comando de força-tarefa em dissimulação</option></select></div>
<div><label for="symbolTransversal">Modificador transversal brasileiro</label><select id="symbolTransversal"></select></div>
<div><label for="symbolModifier1">Modificador 1</label><select id="symbolModifier1"></select></div>
<div><label for="symbolModifier2">Modificador 2</label><select id="symbolModifier2"></select></div>
</div>
<fieldset><legend>Amplificadores textuais</legend>
<p>Textos opcionais posicionados ao redor da calunga; a posição depende do tipo de símbolo.</p>
<div class="symbol-grid">${amplifierFields.map(field => `<div><label for="symbol-${field}">${labels[field]}</label><input id="symbol-${field}" maxlength="50"></div>`).join('')}</div>
</fieldset>
<details><summary>SIDC e outros campos</summary>
<p>O SIDC numérico permite usar outras combinações suportadas pela biblioteca. Ao mudar os seletores, os respectivos campos do SIDC serão atualizados.</p>
<label for="symbolSidc">SIDC (20 ou 30 dígitos)</label><input id="symbolSidc" maxlength="30" inputmode="numeric">
<div class="symbol-grid">${otherFields.map(field => `<div><label for="symbol-${field}">${labels[field]}</label><input id="symbol-${field}" maxlength="50"></div>`).join('')}</div>
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
                    const query = searchText(get('symbolSearch').value.trim());
                    const kind = get('symbolCatalog').value || 'icons';
                    catalog[kind].forEach((entry, index) => {
                        if (!query || searchText(`${entry.name} ${entry.sidc}`).includes(query)) {
                            addOption(entity, String(index), `${entry.name} (${entry.sidc})`);
                        }
                    });
                    const currentCode = sidc.value;
                    const entityExtension = code => code.length === 30 && code.slice(20, 23) === '076'
                        ? (Number(code.slice(23)) >> 14) & 31 : 0;
                    const entryIndex = catalog[kind].findIndex(entry =>
                        entry.sidc.slice(10, 16) === currentCode.slice(10, 16) &&
                        entityExtension(entry.sidc) === entityExtension(currentCode));
                    entity.value = String(entryIndex);
                    const transversal = get('symbolTransversal');
                    transversal.replaceChildren();
                    addOption(transversal, '0', 'Nenhum');
                    const categoryExtensions = window.PlanMilTBrazilian.extensions[set.value];
                    if (categoryExtensions && categoryExtensions.ModificadorTransversal) {
                        const transversalLabels = { BLD: 'Blindado', MTZ: 'Motorizado', MEC: 'Mecanizado', DEFESA_AEREA: 'Defesa aérea' };
                        for (const [name, value] of Object.entries(categoryExtensions.ModificadorTransversal)) {
                            if (typeof value === 'number' && value > 0) addOption(transversal, String(value), transversalLabels[name] || name);
                        }
                    }
                    transversal.value = String(currentCode.length === 30 && currentCode.slice(20, 23) === '076'
                        ? (Number(currentCode.slice(23)) >> 10) & 7 : 0);
                    for (const [id, key, extKey] of [['symbolModifier1', 'modifiers1', 'Modificador1'], ['symbolModifier2', 'modifiers2', 'Modificador2']]) {
                        const select = get(id);
                        select.replaceChildren();
                        addOption(select, '00', 'Nenhum');
                        for (const item of catalog[key]) {
                            if (/^\d{2}$/.test(item.code) && item.code !== '00') addOption(select, item.code, item.name);
                        }
                        const extensions = window.PlanMilTBrazilian.extensions[set.value];
                        const values = extensions && extensions[extKey];
                        const names = extensions && extensions[`${extKey}Labels`];
                        if (values) for (const [name, value] of Object.entries(values)) {
                            if (typeof value === 'number' && value > 0) addOption(select, `ext:${value}`, (names && names[name]) || name);
                        }
                        const first = id === 'symbolModifier1';
                        const position = first ? 16 : 18;
                        const standard = currentCode.slice(position, position + 2);
                        const bits = currentCode.length === 30 && currentCode.slice(20, 23) === '076'
                            ? Number(currentCode.slice(23)) : 0;
                        const extension = (bits >> (first ? 5 : 0)) & 31;
                        select.value = standard === '99' ? `ext:${extension}` : standard;
                    }
                }
                /** Preenche os controles a partir do SIDC, sem modificar seu conteúdo. */
                function fillFromConfig(config) {
                    sidc.value = config.sidc;
                    for (const field of fields) get(`symbol-${field}`).value = config.options[field] || '';
                    set.value = config.sidc.slice(4, 6);
                    if (!sets[set.value]) throw new Error('Categoria de calunga não disponível no catálogo brasileiro.');
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
                /** @param {boolean} first - Indica o setor. @param {string} value - Código ou extensão brasileira. */
                function replaceModifier(first, value) {
                    if (!/^(?:\d{2}|ext:\d+)$/.test(value) || !/^(?:\d{20}|\d{30})$/.test(sidc.value)) return;
                    let code = sidc.value;
                    if (code.length === 30 && code.slice(20, 23) !== '076') {
                        errorText.textContent = 'Extensão de outro país não pode ser editada neste seletor.';
                        return;
                    }
                    const extended = value.startsWith('ext:');
                    if (code.length === 20 && extended) code += '0760000000';
                    const position = first ? 16 : 18;
                    code = code.slice(0, position) + (extended ? '99' : value) + code.slice(position + 2);
                    if (code.length === 30) {
                        const shift = first ? 5 : 0;
                        const bits = (Number(code.slice(23)) & ~(31 << shift)) |
                            ((extended ? Number(value.slice(4)) : 0) << shift);
                        code = code.slice(0, 23) + String(bits).padStart(7, '0');
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
                    addOption(set, code, `${catalog.name} (${code})`);
                }
                fillLibrary();
                fillFromConfig(current);
                set.addEventListener('change', () => {
                    get('symbolSearch').value = '';
                    const kind = get('symbolCatalog').value || 'icons';
                    const entry = sets[set.value][kind][0];
                    if (!entry) { errorText.textContent = 'Nenhum símbolo disponível nesta categoria.'; return; }
                    fillFromConfig({ sidc: entry.sidc, options: entry.options || {} });
                });
                get('symbolCatalog').addEventListener('change', fillCatalog);
                entity.addEventListener('change', () => {
                    const kind = get('symbolCatalog').value || 'icons';
                    const entry = sets[set.value][kind][Number(entity.value)];
                    if (!entry) return;
                    const old = sidc.value;
                    const selected = entry.sidc.slice(0, 3) + old.slice(3, 4) + entry.sidc.slice(4, 6) +
                        old.slice(6, 10) + entry.sidc.slice(10);
                    if (kind === 'examples') {
                        fillFromConfig({ sidc: entry.sidc, options: entry.options || {} });
                        return;
                    }
                    sidc.value = selected;
                    fillCatalog();
                    updatePreview();
                });
                get('symbolSearch').addEventListener('input', fillCatalog);
                for (const [id, start, length] of [['symbolAffiliation', 3, 1],
                    ['symbolEchelon', 8, 2], ['symbolStatus', 6, 1], ['symbolHeadquarters', 7, 1]]) {
                    get(id).addEventListener('change', event => replaceSidc(start, length, event.target.value));
                }
                get('symbolModifier1').addEventListener('change', event => replaceModifier(true, event.target.value));
                get('symbolModifier2').addEventListener('change', event => replaceModifier(false, event.target.value));
                get('symbolTransversal').addEventListener('change', event => {
                    if (!/^[0-7]$/.test(event.target.value) || !/^(?:\d{20}|\d{30})$/.test(sidc.value)) return;
                    let code = sidc.value;
                    if (code.length === 30 && code.slice(20, 23) !== '076') {
                        errorText.textContent = 'Extensão de outro país não pode ser editada neste seletor.';
                        return;
                    }
                    if (code.length === 20) code += '0760000000';
                    const bits = (Number(code.slice(23)) & ~(7 << 10)) | (Number(event.target.value) << 10);
                    sidc.value = code.slice(0, 23) + String(bits).padStart(7, '0');
                    updatePreview();
                });
                sidc.addEventListener('input', () => {
                    if (/^(?:\d{20}|\d{30})$/.test(sidc.value) && sets[sidc.value.slice(4, 6)]) {
                        fillFromConfig({ sidc: sidc.value, options: Object.fromEntries(fields.map(field => [field, get(`symbol-${field}`).value])) });
                    } else updatePreview();
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
