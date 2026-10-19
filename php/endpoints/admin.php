<?php
declare(strict_types=1);

use PlanMilT\Application\AdminService;
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/AdminService.php';

const PLANMILT_REQUIRE_ADMIN_PASSWORD_CHANGE = false;

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");

$requestPath = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/admin.php'), PHP_URL_PATH);
$scriptDirectory = str_replace('\\', '/', dirname(is_string($requestPath) ? $requestPath : '/admin.php'));
$cookiePath = $scriptDirectory === '/' || $scriptDirectory === '.' ? '/' : $scriptDirectory . '/';
$isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off';
if ($isHttps) {
    header('Strict-Transport-Security: max-age=31536000');
}
$remoteAddress = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
session_name('PlanMilTAdmin');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => $cookiePath,
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

if (!isset($_SESSION['admin_csrf']) || !is_string($_SESSION['admin_csrf'])) {
    $_SESSION['admin_csrf'] = bin2hex(random_bytes(32));
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $clientConfig = json_encode([
        'csrf' => $_SESSION['admin_csrf'],
        'authenticated' => ($_SESSION['admin_authenticated'] ?? false) === true,
        'mustChangePassword' => PLANMILT_REQUIRE_ADMIN_PASSWORD_CHANGE
            && ($_SESSION['admin_must_change_password'] ?? false) === true,
        'requirePasswordChange' => PLANMILT_REQUIRE_ADMIN_PASSWORD_CHANGE,
    ], JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_AMP | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
    header('Content-Type: text/html; charset=utf-8');
    ?>
<!doctype html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Administração | PlanMilT</title>
    <style>
        :root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d2939;background:#f3f6fa;font-synthesis:none;text-rendering:optimizeLegibility}
        *{box-sizing:border-box}
        body{min-width:320px;min-height:100vh;margin:0;background:radial-gradient(ellipse at 88% 0,#e2ebf6 0,transparent 34rem),#f3f6fa}
        button,input,select,textarea{font:inherit}
        button{min-height:42px;border:1px solid transparent;border-radius:8px;padding:9px 15px;background:#34577f;color:#fff;font-weight:650;cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .16s ease}
        button:hover:not(:disabled){background:#284768;transform:translateY(-1px)}
        button:active:not(:disabled){transform:translateY(0)}
        button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #8bb7e6;outline-offset:2px}
        button.secondary{border-color:#d4dce6;background:#fff;color:#34445a}
        button.secondary:hover:not(:disabled){border-color:#aebdce;background:#f6f8fb}
        button.danger{background:#a33a42}
        button.danger:hover:not(:disabled){background:#842d35}
        button:disabled{opacity:.52;cursor:not-allowed}
        .admin-shell{width:min(1180px,calc(100% - 48px));margin:0 auto;padding:28px 0 48px}
        .topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:38px}
        .brand{display:inline-flex;align-items:center;gap:11px;color:#1e344d;text-decoration:none;font-size:15px;font-weight:750;letter-spacing:.01em}
        .brand-mark{display:grid;width:38px;height:38px;place-items:center;border-radius:11px;background:#294969;color:#fff;font-size:17px;font-weight:800;box-shadow:0 5px 12px #2949692b}
        .topbar-tag{border:1px solid #d7e0eb;border-radius:999px;padding:7px 11px;background:#ffffffa8;color:#52657b;font-size:11px;font-weight:750;letter-spacing:.12em}
        .page-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:24px}
        .eyebrow{margin:0 0 8px;color:#587594;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
        h1{margin:0;color:#1c3550;font-size:clamp(27px,4vw,38px);letter-spacing:-.04em;line-height:1.12}
        .intro{max-width:690px;margin:11px 0 0;color:#64748b;font-size:14px;line-height:1.65}
        .heading-note{flex:0 0 auto;display:flex;align-items:center;gap:9px;padding:10px 13px;border:1px solid #dce5ef;border-radius:10px;background:#ffffffa8;color:#58708a;font-size:12px;font-weight:650}
        .heading-dot{width:8px;height:8px;border-radius:50%;background:#45a477;box-shadow:0 0 0 4px #45a4771c}
        .notice{display:none;margin:0 0 18px;padding:12px 15px;border:1px solid #cddded;border-radius:9px;background:#edf5fc;color:#315579;font-size:14px;line-height:1.5}
        .notice:not(:empty){display:block}
        .notice.error{border-color:#f0c9c7;background:#fff1f0;color:#923a36}
        .panel{margin:0 0 20px;padding:24px;border:1px solid #e0e7ef;border-radius:14px;background:#fff;box-shadow:0 10px 28px #203a5710}
        .panel h2{margin:0 0 6px;color:#233c57;font-size:18px;letter-spacing:-.02em}
        .panel>p{margin:0 0 18px;color:#64748b;font-size:13px;line-height:1.6}
        #loginPanel,#passwordPanel{max-width:470px;margin:30px auto}
        #loginForm,#passwordForm{margin-top:18px}
        label{display:grid;gap:7px;margin:15px 0;color:#38485c;font-size:13px;font-weight:650}
        input,select,textarea{width:100%;max-width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:8px;padding:9px 11px;background:#fff;color:#243449}
        input::placeholder,textarea::placeholder{color:#97a4b4}
        textarea{min-height:130px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;line-height:1.5}
        .toolbar,.actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
        .toolbar{justify-content:space-between;padding:16px;border:1px solid #e0e7ef;border-radius:12px;background:#fff}
        .toolbar>label{flex:1 1 250px;max-width:390px;margin:0}
        .toolbar select{background-color:#fff}
        .actions{margin:0}
        .section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin:0 0 16px}
        .section-heading h2{margin:0;color:#203b58;font-size:21px;letter-spacing:-.03em}
        .section-heading p{margin:6px 0 0;color:#6c7b8e;font-size:13px;line-height:1.5}
        .table-card{overflow:hidden;margin-top:16px;border:1px solid #e0e7ef;border-radius:12px;background:#fff;box-shadow:0 8px 22px #203a5708}
        .table-wrap{overflow:auto}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{text-align:left;padding:13px 15px;border-bottom:1px solid #e9edf2;vertical-align:middle}
        th{background:#f7f9fc;color:#5c6d82;font-size:11px;font-weight:750;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
        tbody tr:last-child td{border-bottom:0}
        tbody tr:hover{background:#f8fafc}
        td{overflow-wrap:anywhere;color:#35465a}
        .record-actions{white-space:nowrap}
        .record-actions button{min-height:34px;margin:2px;padding:6px 10px;font-size:12px}
        .pagination{justify-content:space-between;margin-top:13px;padding:3px 1px}
        .pagination .muted{flex:1;text-align:center}
        .muted{color:#718096;font-size:12px}
        #editorPanel{margin-top:20px;border-color:#cfdbea;background:linear-gradient(145deg,#fff,#f9fbfd)}
        #editorPanel form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}
        #editorPanel form>fieldset,#editorPanel form>.actions{grid-column:1/-1}
        #editorPanel fieldset{margin:10px 0 18px;padding:15px;border:1px solid #dce4ed;border-radius:10px;background:#fff}
        #editorPanel legend{padding:0 6px;color:#324b67;font-size:13px;font-weight:750}
        #editorPanel fieldset>label{display:flex;align-items:center;gap:10px;margin:9px 0;padding:8px 10px;border:1px solid #edf0f4;border-radius:7px;background:#fff}
        #editorPanel fieldset>label:hover{border-color:#ccd8e6;background:#f5f8fb}
        #editorPanel fieldset input[type=checkbox]{width:17px;min-height:17px;height:17px;margin:0;accent-color:#435f88}
        #editorPanel fieldset .muted{margin:2px 0 12px;line-height:1.6}
        #editorPanel form>.actions{justify-content:flex-end;margin-top:8px;padding-top:15px;border-top:1px solid #e3e9ef}
        #editorPanel form>.actions button{min-width:130px}
        .table-empty{padding:30px;text-align:center;color:#718096}
        [hidden]{display:none!important}
        @media(max-width:720px){.admin-shell{width:min(100% - 28px,1180px);padding-top:16px}.topbar{margin-bottom:27px}.page-heading{align-items:flex-start;flex-direction:column}.heading-note{display:none}.toolbar{align-items:stretch}.toolbar>label{max-width:none}.toolbar>.actions{justify-content:flex-start}.section-heading{align-items:flex-start;flex-direction:column}.panel{padding:19px}.table-card{margin-top:12px}}
        @media(max-width:520px){.admin-shell{width:calc(100% - 20px);padding-top:12px}.topbar-tag{font-size:9px}.toolbar>.actions{display:grid;width:100%;grid-template-columns:1fr 1fr}.toolbar>.actions button{width:100%;padding-right:8px;padding-left:8px}.toolbar>.actions #logoutButton{grid-column:1/-1}.pagination{gap:7px}.pagination button{padding:8px 10px}.pagination .muted{font-size:11px}#editorPanel form{grid-template-columns:1fr}#editorPanel form>fieldset,#editorPanel form>.actions{grid-column:1}.record-actions{white-space:normal}}
        @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}
    </style>
</head>
<body>
<main class="admin-shell">
    <nav class="topbar" aria-label="Navegação principal">
        <a class="brand" href="./"><span class="brand-mark" aria-hidden="true">P</span><span>PlanMilT <span class="muted">/ Administração</span></span></a>
        <span class="topbar-tag">PAINEL ADMINISTRATIVO</span>
    </nav>
    <header class="page-heading">
        <div>
            <p class="eyebrow">Gestão da aplicação</p>
            <h1>Administração do PlanMilT</h1>
            <p class="intro">Gerencie dados, camadas e preferências do mapa em um só lugar. Credenciais e conteúdo binário dos temas permanecem protegidos.</p>
        </div>
        <div class="heading-note"><span class="heading-dot" aria-hidden="true"></span>Área restrita</div>
    </header>
    <p id="notice" class="notice" role="status"></p>
    <section id="loginPanel" class="panel" hidden>
        <p class="eyebrow">Acesso seguro</p>
        <h2>Acesso administrativo</h2>
        <p>Entre com a senha administrativa para gerenciar a aplicação.</p>
        <form id="loginForm">
            <label>Senha administrativa
                <input type="password" name="password" autocomplete="current-password" required>
            </label>
            <button type="submit">Entrar</button>
        </form>
    </section>
    <section id="passwordPanel" class="panel" hidden>
        <p class="eyebrow">Segurança da conta</p>
        <h2>Defina uma nova senha antes de continuar</h2>
        <p>A senha inicial é temporária. Defina uma nova senha com pelo menos 8 caracteres para liberar o painel.</p>
        <form id="passwordForm">
            <label>Senha atual
                <input type="password" name="currentPassword" autocomplete="current-password" required>
            </label>
            <label>Nova senha
                <input type="password" name="newPassword" autocomplete="new-password" minlength="8" required>
            </label>
            <label>Confirme a nova senha
                <input type="password" name="confirmPassword" autocomplete="new-password" minlength="8" required>
            </label>
            <button type="submit">Alterar senha</button>
        </form>
    </section>
    <section id="adminPanel" hidden>
        <header class="section-heading">
            <div>
                <p class="eyebrow">Área de trabalho</p>
                <h2>Gerenciar aplicação</h2>
                <p>Escolha uma seção para consultar ou editar os dados disponíveis.</p>
            </div>
        </header>
        <div class="toolbar">
            <label>Tipo de registro
                <select id="entitySelect">
                    <option value="settings">Configurações do mapa</option>
                    <option value="map_services">Serviços SIG</option>
                    <option value="map_layers">Camadas WMS</option>
                    <option value="drawings">Desenhos</option>
                    <option value="images">Temas e imagens</option>
                    <option value="task_sequences">Sequências de tarefas</option>
                    <option value="elevation_files">Arquivos de elevação (SRTM3)</option>
                </select>
            </label>
            <div class="actions">
                <button id="editSettingsButton" type="button" hidden>Editar configurações</button>
                <button id="newButton" type="button">Novo registro</button>
                <button id="refreshButton" class="secondary" type="button">Atualizar</button>
                <button id="logoutButton" class="secondary" type="button">Sair</button>
            </div>
        </div>
        <div class="table-card">
            <div class="table-wrap">
                <table>
                    <thead id="tableHead"></thead>
                    <tbody id="tableBody"></tbody>
                </table>
            </div>
        </div>
        <div class="actions pagination">
            <button id="previousButton" class="secondary" type="button">Anterior</button>
            <span id="pageStatus" class="muted"></span>
            <button id="nextButton" class="secondary" type="button">Próxima</button>
        </div>
        <section id="editorPanel" class="panel" hidden>
            <p class="eyebrow">Edição</p>
            <h2 id="editorTitle">Registro</h2>
            <form id="recordForm"></form>
        </section>
    </section>
</main>
<script>
    const adminConfig = <?= $clientConfig ?>;
    const entityLabels = {
        settings: 'Configurações do mapa',
        map_services: 'Serviços SIG',
        map_layers: 'Camadas WMS',
        drawings: 'Desenhos',
        images: 'Temas e imagens',
        task_sequences: 'Sequências de tarefas',
        elevation_files: 'Arquivos de elevação (SRTM3)'
    };
    const fieldsByEntity = {
        map_services: [
            ['name', 'Nome', 'text'],
            ['url', 'URL', 'url']
        ],
        map_layers: [
            ['category_code', 'Categoria (código; vazio remove)', 'text'],
            ['military_relevance', 'Relevância', 'select', [['not_triaged', 'Não triada'], ['potentially_relevant', 'Potencialmente relevante']]],
            ['review_status', 'Revisão', 'select', [['pending', 'Pendente'], ['reviewed', 'Revisada']]],
            ['category_rank', 'Posição recomendada (1 a 10; vazio remove)', 'number']
        ],
        drawings: [
            ['username', 'Usuário', 'text'],
            ['link', 'Identificador/link', 'text'],
            ['geojson', 'GeoJSON', 'textarea']
        ],
        images: [
            ['description', 'Descrição', 'text'],
            ['location', 'Limites geográficos (JSON)', 'textarea'],
            ['is_shared', 'Compartilhável', 'checkbox']
        ],
        task_sequences: [
            ['name', 'Nome', 'text'],
            ['sequence', 'Sequência (JSON)', 'textarea'],
            ['description', 'Descrição', 'textarea']
        ]
    };
    const entitySelect = document.getElementById('entitySelect');
    const loginPanel = document.getElementById('loginPanel');
    const passwordPanel = document.getElementById('passwordPanel');
    const adminPanel = document.getElementById('adminPanel');
    const notice = document.getElementById('notice');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const editorPanel = document.getElementById('editorPanel');
    const recordForm = document.getElementById('recordForm');
    let offset = 0;
    let currentId = 0;
    const defaultLayerOptions = [
        ['OpenTopo', 'OpenTopo (relevo)'],
        ['Google Satellite', 'Google Satellite'],
        ['Infraestruturas', 'Infraestruturas'],
        ['Quadrículas - UTM', 'Quadrículas UTM'],
        ['BDGEx - CTM50', 'BDGEx - CTM50']
    ];

    function showNotice(message, isError = false) {
        notice.textContent = message;
        notice.className = isError ? 'notice error' : 'notice';
    }

    async function request(action, data = {}) {
        const response = await fetch('admin.php', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, csrf: adminConfig.csrf, ...data })
        });
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || 'A operação não foi concluída.');
        if (result.csrf) adminConfig.csrf = result.csrf;
        return result;
    }

    function updatePanels() {
        loginPanel.hidden = adminConfig.authenticated;
        passwordPanel.hidden = !adminConfig.authenticated || !adminConfig.mustChangePassword;
        adminPanel.hidden = !adminConfig.authenticated || adminConfig.mustChangePassword;
        document.getElementById('newButton').hidden = !['map_services', 'drawings', 'task_sequences'].includes(entitySelect.value);
    }

    function displayValue(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    function renderTable(records) {
        tableHead.replaceChildren();
        tableBody.replaceChildren();
        if (entitySelect.value === 'settings' || entitySelect.value === 'elevation_files') return;
        const columns = records.length ? Object.keys(records[0]) : ['Registros'];
        const header = document.createElement('tr');
        [...columns, 'Ações'].forEach(column => {
            const cell = document.createElement('th');
            cell.textContent = column;
            header.appendChild(cell);
        });
        tableHead.appendChild(header);

        if (records.length === 0) {
            const row = document.createElement('tr');
            const empty = document.createElement('td');
            empty.className = 'table-empty';
            empty.colSpan = columns.length + 1;
            empty.textContent = `Nenhum registro de ${entityLabels[entitySelect.value].toLowerCase()} encontrado.`;
            row.appendChild(empty);
            tableBody.appendChild(row);
        }

        records.forEach(record => {
            const row = document.createElement('tr');
            columns.forEach(column => {
                const cell = document.createElement('td');
                cell.textContent = displayValue(record[column]);
                row.appendChild(cell);
            });
            const actions = document.createElement('td');
            actions.className = 'record-actions';
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.textContent = 'Editar';
            edit.addEventListener('click', () => loadRecord(Number(record.id)));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'danger';
            remove.textContent = 'Excluir';
            remove.addEventListener('click', () => deleteRecord(Number(record.id)));
            actions.append(edit, remove);
            row.appendChild(actions);
            tableBody.appendChild(row);
        });
        document.getElementById('pageStatus').textContent = `Página ${Math.floor(offset / 100) + 1} — ${records.length} registros nesta página`;
        document.getElementById('previousButton').disabled = offset === 0;
        document.getElementById('nextButton').disabled = records.length < 100;
    }

    function renderSettingsTable(mapDefaults) {
        tableHead.replaceChildren();
        tableBody.replaceChildren();
        const heading = document.createElement('tr');
        ['Configuração', 'Valor'].forEach(text => {
            const cell = document.createElement('th');
            cell.textContent = text;
            heading.appendChild(cell);
        });
        tableHead.appendChild(heading);
        const rows = [
            ['Camadas ao abrir o mapa', (mapDefaults.defaultLayers || []).join(', ') || 'Nenhuma'],
            ['Centro inicial', mapDefaults.center
                ? `${mapDefaults.center[0]}, ${mapDefaults.center[1]}`
                : 'Manter enquadramento atual'],
            ['Zoom inicial', mapDefaults.zoom ?? 'Manter zoom atual']
        ];
        rows.forEach(([label, value]) => {
            const row = document.createElement('tr');
            [label, String(value)].forEach(text => {
                const cell = document.createElement('td');
                cell.textContent = text;
                row.appendChild(cell);
            });
            tableBody.appendChild(row);
        });
        document.getElementById('pageStatus').textContent = 'Preferências globais aplicadas a todos os usuários';
        document.getElementById('previousButton').disabled = true;
        document.getElementById('nextButton').disabled = true;
    }

    function renderFilesTable(files) {
        tableHead.replaceChildren();
        tableBody.replaceChildren();
        const heading = document.createElement('tr');
        ['Arquivo HGT', 'Tamanho', 'Ações'].forEach(text => {
            const cell = document.createElement('th');
            cell.textContent = text;
            heading.appendChild(cell);
        });
        tableHead.appendChild(heading);
        files.forEach(file => {
            const row = document.createElement('tr');
            const name = document.createElement('td');
            name.textContent = file.name;
            const size = document.createElement('td');
            size.textContent = `${(file.size / 1024 / 1024).toFixed(2)} MB`;
            const actions = document.createElement('td');
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'danger';
            remove.textContent = 'Excluir';
            remove.addEventListener('click', () => deleteFile(file.name));
            actions.appendChild(remove);
            row.append(name, size, actions);
            tableBody.appendChild(row);
        });
        if (files.length === 0) {
            const row = document.createElement('tr');
            const empty = document.createElement('td');
            empty.className = 'table-empty';
            empty.colSpan = 3;
            empty.textContent = 'Nenhum tile HGT disponível em SRTM3.';
            row.appendChild(empty);
            tableBody.appendChild(row);
        }
        document.getElementById('pageStatus').textContent = `${files.length} tiles HGT`;
        document.getElementById('previousButton').disabled = true;
        document.getElementById('nextButton').disabled = true;
    }

    async function loadRecords() {
        try {
            const result = await request(
                entitySelect.value === 'settings' ? 'get_settings'
                    : entitySelect.value === 'elevation_files' ? 'list_files' : 'list',
                { entity: entitySelect.value, offset }
            );
            if (entitySelect.value === 'settings') {
                if (!result.mapDefaults || !Array.isArray(result.mapDefaults.defaultLayers)) {
                    throw new Error('Não foi possível carregar as configurações do mapa.');
                }
                renderSettingsTable(result.mapDefaults);
                editorPanel.hidden = true;
                showNotice('');
                return;
            }
            if (entitySelect.value === 'elevation_files') {
                renderFilesTable(result.files);
                editorPanel.hidden = true;
                showNotice('');
                return;
            }
            renderTable(result.records);
            editorPanel.hidden = true;
            showNotice('');
        } catch (error) {
            showNotice(error.message, true);
        }
    }

    function addDefaultLayersField(form, defaults) {
        const wrapper = document.createElement('fieldset');
        const legend = document.createElement('legend');
        legend.textContent = 'Camadas que iniciam selecionadas';
        wrapper.appendChild(legend);
        const help = document.createElement('p');
        help.className = 'muted';
        help.textContent = 'OpenTopo é a única selecionada inicialmente. Marque outras camadas-base para iniciá-las visíveis; desmarque para deixá-las disponíveis apenas no controle do mapa.';
        wrapper.appendChild(help);
        defaultLayerOptions.forEach(([key, label]) => {
            const row = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'defaultLayers';
            input.value = key;
            input.checked = defaults.defaultLayers.includes(key);
            row.append(input, document.createTextNode(label));
            wrapper.appendChild(row);
        });
        form.appendChild(wrapper);
    }

    function openSettingsEditor(settings) {
        recordForm.replaceChildren();
        document.getElementById('editorTitle').textContent = 'Configurações do mapa';
        addDefaultLayersField(recordForm, settings.mapDefaults);
        [
            ['centerLat', 'Latitude do centro inicial', settings.mapDefaults.center?.[0] ?? ''],
            ['centerLng', 'Longitude do centro inicial', settings.mapDefaults.center?.[1] ?? ''],
            ['zoom', 'Zoom inicial (1–28)', settings.mapDefaults.zoom ?? '']
        ].forEach(([name, label, value]) => {
            const wrapper = document.createElement('label');
            wrapper.textContent = label;
            const input = document.createElement('input');
            input.name = name;
            input.type = 'number';
            input.step = 'any';
            input.value = value;
            if (name === 'centerLat') { input.min = '-90'; input.max = '90'; }
            if (name === 'centerLng') { input.min = '-180'; input.max = '180'; }
            if (name === 'zoom') { input.min = '1'; input.max = '28'; }
            wrapper.appendChild(input);
            recordForm.appendChild(wrapper);
        });
        const save = document.createElement('button');
        save.type = 'submit';
        save.textContent = 'Salvar configurações';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'secondary';
        cancel.textContent = 'Cancelar';
        cancel.addEventListener('click', () => { editorPanel.hidden = true; });
        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.append(save, cancel);
        recordForm.appendChild(actions);
        editorPanel.hidden = false;
        recordForm.dataset.editorType = 'settings';
    }

    function addField(form, definition, value, isNew) {
        const [key, label, type, options] = definition;
        const wrapper = document.createElement('label');
        wrapper.textContent = label;
        let input;
        if (type === 'select') {
            input = document.createElement('select');
            options.forEach(([optionValue, optionLabel]) => {
                const option = document.createElement('option');
                option.value = optionValue;
                option.textContent = optionLabel;
                input.appendChild(option);
            });
        } else if (type === 'textarea') {
            input = document.createElement('textarea');
        } else {
            input = document.createElement('input');
            input.type = type;
        }
        input.name = key;
        if (type === 'checkbox') input.checked = Boolean(Number(value));
        else input.value = displayValue(value);
        if (key === 'category_rank') {
            input.min = '1';
            input.max = '10';
        }
        if (isNew && key === 'sequence') input.value = '[]';
        wrapper.appendChild(input);
        form.appendChild(wrapper);
    }

    function addPasswordField(form) {
        const wrapper = document.createElement('label');
        wrapper.textContent = 'Senha do registro';
        const input = document.createElement('input');
        input.type = 'password';
        input.name = 'password';
        input.autocomplete = 'new-password';
        input.required = true;
        wrapper.appendChild(input);
        form.appendChild(wrapper);
    }

    function openEditor(record, id) {
        currentId = id;
        recordForm.replaceChildren();
        recordForm.dataset.editorType = '';
        const isNew = id === 0;
        document.getElementById('editorTitle').textContent = `${isNew ? 'Novo' : 'Editar'}: ${entityLabels[entitySelect.value]}`;
        fieldsByEntity[entitySelect.value].forEach(field => addField(recordForm, field, record[field[0]], isNew));
        if (isNew && ['drawings', 'task_sequences'].includes(entitySelect.value)) addPasswordField(recordForm);
        const save = document.createElement('button');
        save.type = 'submit';
        save.textContent = 'Salvar';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'secondary';
        cancel.textContent = 'Cancelar';
        cancel.addEventListener('click', () => { editorPanel.hidden = true; });
        const actions = document.createElement('div');
        actions.className = 'actions';
        actions.append(save, cancel);
        recordForm.appendChild(actions);
        editorPanel.hidden = false;
        editorPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function loadRecord(id) {
        try {
            const result = await request('get', { entity: entitySelect.value, id });
            openEditor(result.record, id);
        } catch (error) {
            showNotice(error.message, true);
        }
    }

    async function deleteRecord(id) {
        if (!confirm('Confirma excluir este registro? Esta operação não pode ser desfeita.')) return;
        try {
            await request('delete', { entity: entitySelect.value, id });
            showNotice('Registro excluído.');
            await loadRecords();
        } catch (error) {
            showNotice(error.message, true);
        }
    }

    async function deleteFile(name) {
        if (!confirm(`Excluir o tile ${name}? Os perfis de elevação dessa região deixarão de funcionar até o arquivo ser enviado novamente.`)) return;
        try {
            await request('delete_file', { name });
            showNotice('Tile excluído.');
            await loadRecords();
        } catch (error) {
            showNotice(error.message, true);
        }
    }

    document.getElementById('loginForm').addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const result = await request('login', { password: new FormData(event.currentTarget).get('password') });
            adminConfig.authenticated = true;
            adminConfig.mustChangePassword = adminConfig.requirePasswordChange && result.mustChangePassword;
            if (result.csrf) adminConfig.csrf = result.csrf;
            updatePanels();
            if (!adminConfig.mustChangePassword) await loadRecords();
            showNotice(adminConfig.mustChangePassword ? 'A senha inicial foi aceita; altere-a para liberar o painel.' : 'Acesso autorizado.');
        } catch (error) {
            showNotice(error.message, true);
        }
    });

    document.getElementById('passwordForm').addEventListener('submit', async event => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (form.get('newPassword') !== form.get('confirmPassword')) {
            showNotice('A confirmação da senha não corresponde.', true);
            return;
        }
        try {
            const result = await request('change_password', {
                currentPassword: form.get('currentPassword'),
                newPassword: form.get('newPassword')
            });
            if (result.csrf) adminConfig.csrf = result.csrf;
            adminConfig.mustChangePassword = false;
            updatePanels();
            await loadRecords();
            showNotice('Senha alterada. O painel está liberado.');
        } catch (error) {
            showNotice(error.message, true);
        }
    });

    recordForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (recordForm.dataset.editorType === 'settings') {
            const formData = new FormData(recordForm);
            const defaultLayers = formData.getAll('defaultLayers');
            const centerLat = formData.get('centerLat');
            const centerLng = formData.get('centerLng');
            const zoom = formData.get('zoom');
            if ((centerLat === '') !== (centerLng === '')) {
                showNotice('Informe latitude e longitude juntas, ou deixe ambas vazias.', true);
                return;
            }
            try {
                const result = await request('save_settings', {
                    mapDefaults: {
                        defaultLayers,
                        center: centerLat === '' && centerLng === '' ? null : [Number(centerLat), Number(centerLng)],
                        zoom: zoom === '' ? null : Number(zoom)
                    }
                });
                adminConfig.csrf = result.csrf || adminConfig.csrf;
                recordForm.dataset.editorType = '';
                editorPanel.hidden = true;
                showNotice('Configurações salvas. Atualize o mapa para aplicar as alterações.');
                await loadRecords();
            } catch (error) {
                showNotice(error.message, true);
            }
            return;
        }
        const data = {};
        new FormData(recordForm).forEach((value, key) => { data[key] = value; });
        recordForm.querySelectorAll('input[type="checkbox"]').forEach(input => { data[input.name] = input.checked; });
        try {
            await request('save', { entity: entitySelect.value, id: currentId, data });
            editorPanel.hidden = true;
            showNotice('Registro salvo.');
            await loadRecords();
        } catch (error) {
            showNotice(error.message, true);
        }
    });

    document.getElementById('newButton').addEventListener('click', () => openEditor({}, 0));
    document.getElementById('editSettingsButton')?.addEventListener('click', async () => {
        try {
            const result = await request('get_settings');
            openSettingsEditor(result);
        } catch (error) {
            showNotice(error.message, true);
        }
    });
    document.getElementById('refreshButton').addEventListener('click', loadRecords);
    document.getElementById('logoutButton').addEventListener('click', async () => {
        try {
            await request('logout');
            adminConfig.authenticated = false;
            adminConfig.mustChangePassword = false;
            updatePanels();
            showNotice('Sessão encerrada.');
        } catch (error) {
            showNotice(error.message, true);
        }
    });
    document.getElementById('previousButton').addEventListener('click', () => {
        offset = Math.max(0, offset - 100);
        loadRecords();
    });
    document.getElementById('nextButton').addEventListener('click', () => {
        offset += 100;
        loadRecords();
    });
    entitySelect.addEventListener('change', () => {
        offset = 0;
        updatePanels();
        document.getElementById('newButton').hidden = ['settings', 'elevation_files'].includes(entitySelect.value);
        document.getElementById('editSettingsButton').hidden = entitySelect.value !== 'settings';
        loadRecords();
    });
    updatePanels();
    document.getElementById('newButton').hidden = ['settings', 'elevation_files'].includes(entitySelect.value);
    document.getElementById('editSettingsButton').hidden = entitySelect.value !== 'settings';
    if (adminConfig.authenticated && !adminConfig.mustChangePassword) loadRecords();
</script>
</body>
</html>
    <?php
    exit;
}

header('Content-Type: application/json; charset=utf-8');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: GET, POST');
    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$contentLength = filter_var($_SERVER['CONTENT_LENGTH'] ?? '0', FILTER_VALIDATE_INT);
if ($contentLength === false || $contentLength > 6291456) {
    http_response_code(413);
    echo json_encode(['error' => 'A requisição excede o limite permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$request = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($request) || !is_string($request['action'] ?? null)) {
    http_response_code(400);
    echo json_encode(['error' => 'Requisição inválida.'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!is_string($request['csrf'] ?? null) || !hash_equals($_SESSION['admin_csrf'], $request['csrf'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Sessão inválida ou expirada; atualize a página.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $database = ConnectionFactory::create();
    $admin = new AdminService($database);
    $action = $request['action'];
    if ($action === 'login') {
        if (($_SESSION['admin_authenticated'] ?? false) === true) {
            throw new RuntimeException('A sessão administrativa já está autenticada.');
        }
        $password = $request['password'] ?? null;
        if (!is_string($password) || $password === '') {
            throw new RuntimeException('Informe a senha administrativa.');
        }
        $result = $admin->authenticate($password, $remoteAddress);
        session_regenerate_id(true);
        $_SESSION['admin_authenticated'] = true;
        $_SESSION['admin_must_change_password'] = $result['mustChangePassword'];
        $_SESSION['admin_csrf'] = bin2hex(random_bytes(32));
        echo json_encode($result + ['csrf' => $_SESSION['admin_csrf']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'logout') {
        $_SESSION = [];
        session_regenerate_id(true);
        $_SESSION['admin_csrf'] = bin2hex(random_bytes(32));
        echo json_encode(['success' => true, 'csrf' => $_SESSION['admin_csrf']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (PLANMILT_REQUIRE_ADMIN_PASSWORD_CHANGE
        && $action !== 'change_password'
        && ($_SESSION['admin_must_change_password'] ?? false) === true) {
        http_response_code(403);
        echo json_encode(['error' => 'Altere a senha inicial antes de usar o painel.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (($_SESSION['admin_authenticated'] ?? false) !== true) {
        http_response_code(401);
        echo json_encode(['error' => 'Autenticação administrativa necessária.'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'change_password') {
        $currentPassword = $request['currentPassword'] ?? null;
        $newPassword = $request['newPassword'] ?? null;
        if (!is_string($currentPassword) || !is_string($newPassword)) {
            throw new RuntimeException('Dados inválidos para alterar a senha.');
        }
        $admin->changePassword($currentPassword, $newPassword);
        session_regenerate_id(true);
        $_SESSION['admin_must_change_password'] = false;
        $_SESSION['admin_csrf'] = bin2hex(random_bytes(32));
        echo json_encode(['success' => true, 'csrf' => $_SESSION['admin_csrf']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'get_settings') {
        echo json_encode(
            ['mapDefaults' => $admin->getMapDefaults()],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        exit;
    }

    if ($action === 'save_settings') {
        $mapDefaults = $request['mapDefaults'] ?? null;
        if (!is_array($mapDefaults)) {
            throw new RuntimeException('Configurações do mapa inválidas.');
        }
        $savedSettings = $admin->saveMapDefaults($mapDefaults);
        echo json_encode(
            ['mapDefaults' => $savedSettings],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        exit;
    }

    if ($action === 'list_files') {
        echo json_encode(
            ['files' => $admin->listElevationFiles(dirname(__DIR__, 2) . '/SRTM3')],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        exit;
    }

    if ($action === 'delete_file') {
        $name = $request['name'] ?? null;
        if (!is_string($name)) {
            throw new RuntimeException('Nome do arquivo HGT inválido.');
        }
        $admin->deleteElevationFile(dirname(__DIR__, 2) . '/SRTM3', $name);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'list') {
        $entity = $request['entity'] ?? null;
        $offset = filter_var($request['offset'] ?? 0, FILTER_VALIDATE_INT);
        if (!is_string($entity) || $offset === false) {
            throw new RuntimeException('Parâmetros inválidos para listar registros.');
        }
        echo json_encode(
            ['records' => $admin->listRecords($entity, $offset)],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        exit;
    }

    if ($action === 'get') {
        $entity = $request['entity'] ?? null;
        $id = filter_var($request['id'] ?? null, FILTER_VALIDATE_INT);
        if (!is_string($entity) || $id === false) {
            throw new RuntimeException('Parâmetros inválidos para consultar o registro.');
        }
        echo json_encode(
            ['record' => $admin->getRecord($entity, $id)],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        exit;
    }

    if ($action === 'save') {
        $entity = $request['entity'] ?? null;
        $id = filter_var($request['id'] ?? 0, FILTER_VALIDATE_INT);
        $data = $request['data'] ?? null;
        if (!is_string($entity) || $id === false || !is_array($data)) {
            throw new RuntimeException('Parâmetros inválidos para salvar o registro.');
        }
        echo json_encode(
            ['id' => $admin->saveRecord($entity, $id, $data)],
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );
        exit;
    }

    if ($action === 'delete') {
        $entity = $request['entity'] ?? null;
        $id = filter_var($request['id'] ?? null, FILTER_VALIDATE_INT);
        if (!is_string($entity) || $id === false) {
            throw new RuntimeException('Parâmetros inválidos para excluir o registro.');
        }
        $admin->deleteRecord($entity, $id);
        echo json_encode(['success' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(400);
    echo json_encode(['error' => 'Ação administrativa inválida.'], JSON_UNESCAPED_UNICODE);
} catch (RuntimeException $error) {
    if (http_response_code() < 400) {
        http_response_code(400);
    }
    echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível concluir a operação administrativa.'], JSON_UNESCAPED_UNICODE);
}
