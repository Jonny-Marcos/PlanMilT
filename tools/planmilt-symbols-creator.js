/**
 * Abre um criador independente de símbolos e resolve com o ícone confirmado.
 * @param {{initial?: {sidc: string, options?: Object}}} [settings] Configuração inicial.
 * @returns {Promise<Object|null>} Símbolo renderizado ou null ao cancelar.
 */
function openSymbolCreator({ initial = { sidc: '10031000001211000000', options: {} } } = {}) {
    const dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function') {
        throw new Error('Este navegador não oferece suporte a diálogos modais.');
    }

    const amplifierFields = [
        ['uniqueDesignation', 'Designação'],
        ['higherFormation', 'Subordinação'],
        ['staffComments', 'Informações adicionais'],
        ['dtg', 'GDH'],
        ['hostile', 'Credibilidade'],
        ['location', 'Localização'],
        ['altitudeDepth', 'Altitude / profundidade'],
        ['speed', 'Velocidade']
    ];
    dialog.className = 'planmilt-symbol-creator';
    dialog.setAttribute('aria-labelledby', 'planMilTSymbolCreatorTitle');
    dialog.innerHTML = `<style>
.planmilt-symbol-creator{box-sizing:border-box;width:min(920px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 24px);padding:20px;border:0;border-radius:10px;color:#27364a;font:14px/1.45 system-ui,sans-serif}
.planmilt-symbol-creator::backdrop{background:rgba(15,23,42,.58)}
.planmilt-symbol-creator *{box-sizing:border-box}
.planmilt-symbol-creator h2{margin:0 0 8px;font-size:22px}
.planmilt-symbol-creator p{margin:6px 0 12px}
.planmilt-symbol-creator .creator-preview{display:flex;min-height:120px;align-items:center;justify-content:center;margin:14px 0;padding:10px;overflow:auto;border:1px solid #d3d8e0;border-radius:8px;background:#f4f6f9}
.planmilt-symbol-creator .creator-preview img{max-width:100%;height:auto}
.planmilt-symbol-creator .creator-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.planmilt-symbol-creator label{display:block;margin-bottom:4px;font-weight:600}
.planmilt-symbol-creator input,.planmilt-symbol-creator select{width:100%;min-height:40px;padding:7px;border:1px solid #c5cad2;border-radius:6px;background:#fff;color:inherit;font:inherit}
.planmilt-symbol-creator fieldset{margin:14px 0;padding:12px;border:1px solid #d3d8e0;border-radius:8px}
.planmilt-symbol-creator legend{padding:0 5px;font-weight:700}
.planmilt-symbol-creator [role=status]{min-height:1.5em;color:#a00000}
.planmilt-symbol-creator .creator-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.planmilt-symbol-creator button{min-height:40px;padding:8px 14px;border:1px solid #aeb8c5;border-radius:6px;background:#fff;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.planmilt-symbol-creator button[type=button][data-confirm]{border-color:#435f88;background:#435f88;color:white}
@media(max-width:680px){.planmilt-symbol-creator{padding:14px}.planmilt-symbol-creator .creator-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:420px){.planmilt-symbol-creator .creator-grid{grid-template-columns:1fr}}
</style>
<h2 id="planMilTSymbolCreatorTitle">Criar ícone militar</h2>
<p>Escolha um símbolo, ajuste seus atributos e confirme para obter o SVG.</p>
<div class="creator-preview"><img data-preview alt="Prévia do ícone"></div>
<p data-error role="status" aria-live="polite"></p>
<div class="creator-grid">
<div><label for="creator-category">Categoria</label><select id="creator-category"></select></div>
<div><label for="creator-kind">Catálogo</label><select id="creator-kind"><option value="icons">Ícones centrais</option><option value="examples">Exemplos doutrinários</option></select></div>
<div><label for="creator-search">Buscar símbolo</label><input id="creator-search" type="search" placeholder="Ex.: infantaria"></div>
<div><label for="creator-entity">Símbolo</label><select id="creator-entity"></select></div>
<div><label for="creator-affiliation">Afiliação</label><select id="creator-affiliation"><option value="3">Amigo</option><option value="6">Inimigo</option><option value="4">Neutro</option><option value="1">Desconhecido</option></select></div>
<div><label for="creator-echelon">Escalão / mobilidade</label><select id="creator-echelon">
<option value="00">Não especificado</option><option value="11">Equipe / guarnição</option><option value="12">Esquadra</option><option value="13">Seção</option><option value="14">Pelotão</option><option value="15">Companhia</option><option value="16">Batalhão</option><option value="17">Regimento</option><option value="18">Brigada</option><option value="21">Divisão</option><option value="22">Corpo</option><option value="23">Exército</option><option value="24">Grupo de exércitos</option><option value="25">Região / teatro</option><option value="26">Comando</option>
</select></div>
<div><label for="creator-status">Situação</label><select id="creator-status"><option value="0">Presente</option><option value="1">Planejado</option><option value="2">Operacional</option><option value="3">Danificado</option><option value="4">Destruído</option><option value="5">Capacidade máxima</option></select></div>
<div><label for="creator-headquarters">Comando / força-tarefa</label><select id="creator-headquarters"><option value="0">Nenhum</option><option value="1">Dissimulação</option><option value="2">Comando</option><option value="3">Comando em dissimulação</option><option value="4">Força-tarefa</option><option value="5">Força-tarefa em dissimulação</option><option value="6">Comando de força-tarefa</option><option value="7">Comando de força-tarefa em dissimulação</option></select></div>
<div><label for="creator-transversal">Modificador transversal</label><select id="creator-transversal"></select></div>
<div><label for="creator-modifier1">Modificador 1</label><select id="creator-modifier1"></select></div>
<div><label for="creator-modifier2">Modificador 2</label><select id="creator-modifier2"></select></div>
</div>
<fieldset><legend>Amplificadores textuais</legend><div class="creator-grid">
${amplifierFields.map(([field, label]) => `<div><label for="creator-${field}">${label}</label><input id="creator-${field}" maxlength="50"></div>`).join('')}
</div></fieldset>
<div class="creator-actions"><button type="button" data-cancel>Cancelar</button><button type="button" data-confirm>Gerar ícone</button></div>`;

    const get = selector => dialog.querySelector(selector);
    const categorySelect = get('#creator-category');
    const kindSelect = get('#creator-kind');
    const entitySelect = get('#creator-entity');
    const searchInput = get('#creator-search');
    const preview = get('[data-preview]');
    const error = get('[data-error]');
    const categories = window.PlanMilTSymbols.catalog;
    let current = {
        sidc: typeof initial?.sidc === 'string' ? initial.sidc : '10031000001211000000',
        options: initial?.options && typeof initial.options === 'object' ? { ...initial.options } : {}
    };
    let result = null;

    function addOption(select, value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    }

    function setModifierOptions(select, standardItems, extensions, field, code, bitValue) {
        select.replaceChildren();
        addOption(select, '00', 'Nenhum');
        for (const item of standardItems || []) {
            if (/^\d{2}$/.test(item.code) && item.code !== '00') addOption(select, item.code, item.name);
        }
        const values = extensions?.[field];
        const labels = extensions?.[`${field}Labels`];
        if (values) {
            for (const [name, value] of Object.entries(values)) {
                if (typeof value === 'number' && value > 0) {
                    addOption(select, `ext:${value}`, labels?.[name] || name);
                }
            }
        }
        const standard = code.slice(bitValue ? 16 : 18, bitValue ? 18 : 20);
        const bits = code.length === 30 && code.slice(20, 23) === '076' ? Number(code.slice(23)) : 0;
        const extension = (bits >> (bitValue ? 5 : 0)) & 31;
        select.value = standard === '99' ? `ext:${extension}` : standard;
    }

    function fillModifierControls() {
        const code = current.sidc;
        const extensions = window.PlanMilTSymbols.getExtensions(categorySelect.value);
        const transversal = get('#creator-transversal');
        transversal.replaceChildren();
        addOption(transversal, '0', 'Nenhum');
        const transversalLabels = { BLD: 'Blindado', MTZ: 'Motorizado', MEC: 'Mecanizado', DEFESA_AEREA: 'Defesa aérea' };
        for (const [name, value] of Object.entries(extensions?.ModificadorTransversal || {})) {
            if (typeof value === 'number' && value > 0) addOption(transversal, String(value), transversalLabels[name] || name);
        }
        transversal.value = String(code.length === 30 && code.slice(20, 23) === '076'
            ? (Number(code.slice(23)) >> 10) & 7 : 0);
        const category = categories[categorySelect.value];
        setModifierOptions(get('#creator-modifier1'), category.modifiers1, extensions, 'Modificador1', code, true);
        setModifierOptions(get('#creator-modifier2'), category.modifiers2, extensions, 'Modificador2', code, false);
    }

    function updatePreview() {
        current.options = {
            ...current.options,
            ...Object.fromEntries(amplifierFields.map(([field]) => [field, get(`#creator-${field}`).value]))
        };
        try {
            preview.src = window.PlanMilTSymbols.renderSymbol({
                sidc: current.sidc,
                options: { size: 60, ...current.options }
            }).dataUrl;
            error.textContent = '';
            get('[data-confirm]').disabled = false;
        } catch (renderError) {
            preview.removeAttribute('src');
            error.textContent = renderError.message;
            get('[data-confirm]').disabled = true;
        }
    }

    function replaceSidc(start, length, value) {
        if (/^(?:\d{20}|\d{30})$/.test(current.sidc)) {
            current.sidc = current.sidc.slice(0, start) + value + current.sidc.slice(start + length);
            updatePreview();
        }
    }

    function replaceModifier(first, value) {
        if (!/^(?:\d{2}|ext:\d+)$/.test(value)) return;
        let code = current.sidc;
        if (code.length === 30 && code.slice(20, 23) !== '076') {
            error.textContent = 'Extensões de outro país não podem ser editadas neste criador.';
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
        current.sidc = code;
        updatePreview();
    }

    function fillCatalog() {
        const category = categories[categorySelect.value];
        const kind = kindSelect.value;
        const entries = category[kind] || [];
        const query = searchInput.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const entityExtension = code => code.length === 30 && code.slice(20, 23) === '076'
            ? (Number(code.slice(23)) >> 14) & 31 : 0;
        const currentIndex = entries.findIndex(entry =>
            entry.sidc.slice(10, 16) === current.sidc.slice(10, 16) &&
            entityExtension(entry.sidc) === entityExtension(current.sidc));
        const matches = entries.map((entry, index) => ({ entry, index }))
            .filter(({ entry }) => !query ||
                `${entry.name} ${entry.sidc}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query))
            .sort((a, b) => a.entry.name.localeCompare(b.entry.name, 'pt-BR', { sensitivity: 'base' }));
        entitySelect.replaceChildren();
        const isCurrentVisible = matches.some(({ index }) => index === currentIndex);
        if (!isCurrentVisible) addOption(entitySelect, '', matches.length ? 'Selecione um símbolo' : 'Nenhum resultado');
        for (const { entry, index } of matches) addOption(entitySelect, String(index), entry.name);
        entitySelect.value = isCurrentVisible ? String(currentIndex) : '';
        fillModifierControls();
    }

    function fillFromConfig(config) {
        if (!config || !/^(?:\d{20}|\d{30})$/.test(config.sidc) || !categories[config.sidc.slice(4, 6)]) {
            throw new Error('Configuração inicial inválida ou categoria indisponível.');
        }
        current = { sidc: config.sidc, options: { ...(config.options || {}) } };
        categorySelect.value = config.sidc.slice(4, 6);
        for (const [id, position, length] of [
            ['#creator-affiliation', 3, 1],
            ['#creator-status', 6, 1],
            ['#creator-headquarters', 7, 1],
            ['#creator-echelon', 8, 2]
        ]) {
            get(id).value = config.sidc.slice(position, position + length);
        }
        for (const [field] of amplifierFields) get(`#creator-${field}`).value = current.options[field] || '';
        fillCatalog();
        updatePreview();
    }

    for (const [code, category] of Object.entries(categories)) addOption(categorySelect, code, category.name);
    document.body.appendChild(dialog);

    return new Promise((resolve, reject) => {
        dialog.addEventListener('close', () => {
            dialog.remove();
            resolve(result);
        }, { once: true });

        try {
            const firstCategory = Object.keys(categories)[0];
            const start = current.sidc;
            const initialIsUsable = /^(?:\d{20}|\d{30})$/.test(start) && categories[start.slice(4, 6)];
            if (!initialIsUsable) {
                const entry = categories[firstCategory].icons[0];
                current = { sidc: entry.sidc, options: entry.options || {} };
            }
            fillFromConfig(current);
            categorySelect.addEventListener('change', () => {
                searchInput.value = '';
                const entry = categories[categorySelect.value][kindSelect.value][0];
                if (entry) fillFromConfig({ sidc: entry.sidc, options: entry.options || {} });
                else {
                    entitySelect.replaceChildren();
                    updatePreview();
                }
            });
            kindSelect.addEventListener('change', fillCatalog);
            searchInput.addEventListener('input', fillCatalog);
            entitySelect.addEventListener('change', () => {
                const entry = categories[categorySelect.value][kindSelect.value][Number(entitySelect.value)];
                if (!entry || entitySelect.value === '') return;
                if (kindSelect.value === 'examples') {
                    fillFromConfig({ sidc: entry.sidc, options: entry.options || {} });
                    return;
                }
                const old = current.sidc;
                const sidc = entry.sidc.slice(0, 3) + old.slice(3, 4) + entry.sidc.slice(4, 6) +
                    old.slice(6, 10) + entry.sidc.slice(10);
                current.sidc = sidc;
                fillModifierControls();
                updatePreview();
            });
            for (const [selector, startAt, length] of [
                ['#creator-affiliation', 3, 1],
                ['#creator-status', 6, 1],
                ['#creator-headquarters', 7, 1],
                ['#creator-echelon', 8, 2]
            ]) {
                get(selector).addEventListener('change', event => replaceSidc(startAt, length, event.target.value));
            }
            get('#creator-modifier1').addEventListener('change', event => replaceModifier(true, event.target.value));
            get('#creator-modifier2').addEventListener('change', event => replaceModifier(false, event.target.value));
            get('#creator-transversal').addEventListener('change', event => {
                let code = current.sidc;
                if (!/^[0-7]$/.test(event.target.value)) return;
                if (code.length === 30 && code.slice(20, 23) !== '076') {
                    error.textContent = 'Extensões de outro país não podem ser editadas neste criador.';
                    return;
                }
                if (code.length === 20) code += '0760000000';
                const bits = (Number(code.slice(23)) & ~(7 << 10)) | (Number(event.target.value) << 10);
                current.sidc = code.slice(0, 23) + String(bits).padStart(7, '0');
                updatePreview();
            });
            for (const [field] of amplifierFields) get(`#creator-${field}`).addEventListener('input', updatePreview);
            get('[data-cancel]').addEventListener('click', () => dialog.close());
            get('[data-confirm]').addEventListener('click', () => {
                try {
                    const config = { sidc: current.sidc, options: { ...current.options } };
                    result = { config, ...window.PlanMilTSymbols.renderSymbol(config) };
                    dialog.close();
                } catch (renderError) {
                    error.textContent = renderError.message;
                }
            });
            dialog.showModal();
        } catch (error) {
            dialog.remove();
            reject(error);
        }
    }).then(() => result);
}
