<?php
declare(strict_types=1);

use PlanMilT\Tools\WmsCapabilitiesParser;

require_once __DIR__ . '/WmsCapabilitiesParser.php';

const MAX_CAPABILITIES_BYTES = 12582912;
const MAX_FEATURE_INFO_BYTES = 1048576;
const MAX_FEATURE_INFO_REQUESTS = 200;
const MAX_FEATURE_INFO_PER_SERVICE = 10;
const REQUEST_TIMEOUT_SECONDS = 18;
const MAX_CONCURRENT_REQUESTS = 5;

/**
 * Monta a URL de GetCapabilities mantendo parâmetros necessários do serviço.
 *
 * @param string $serviceUrl URL cadastrada para o serviço WMS.
 */
function buildCapabilitiesUrl(string $serviceUrl): string
{
    $parts = parse_url($serviceUrl);
    if (!$parts || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)
        || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) {
        throw new RuntimeException('invalid_service_url');
    }

    $query = [];
    parse_str($parts['query'] ?? '', $query);
    foreach (array_keys($query) as $key) {
        if (in_array(strtoupper((string) $key), ['SERVICE', 'REQUEST', 'VERSION'], true)) {
            unset($query[$key]);
        }
    }
    $query['SERVICE'] = 'WMS';
    $query['REQUEST'] = 'GetCapabilities';
    $query['VERSION'] = '1.3.0';

    $url = strtolower($parts['scheme']) . '://' . $parts['host'];
    if (isset($parts['port'])) {
        $url .= ':' . $parts['port'];
    }
    $url .= $parts['path'] ?? '/';

    return $url . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

/**
 * Baixa um lote limitado de documentos de capacidades via HTTPS/HTTP sem seguir redirecionamentos.
 *
 * @param array<string, string> $urls Mapa entre URL cadastrada e URL de GetCapabilities.
 * @return array<string, array{body: string, status: int, error: string}>
 */
function fetchHttpBatch(array $urls, int $maxBytes): array
{
    $multiHandle = curl_multi_init();
    $handles = [];
    $states = [];

    foreach ($urls as $serviceUrl => $requestUrl) {
        $states[$serviceUrl] = ['body' => '', 'too_large' => false];
        $handle = curl_init($requestUrl);
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => REQUEST_TIMEOUT_SECONDS,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_USERAGENT => 'PlanMilT-WMS-Catalog/1.0',
            CURLOPT_HTTPHEADER => ['Accept: application/xml, text/xml;q=0.9'],
            CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$states, $serviceUrl, $maxBytes): int {
                if (strlen($states[$serviceUrl]['body']) + strlen($chunk) > $maxBytes) {
                    $states[$serviceUrl]['too_large'] = true;
                    return 0;
                }
                $states[$serviceUrl]['body'] .= $chunk;
                return strlen($chunk);
            },
        ]);
        curl_multi_add_handle($multiHandle, $handle);
        $handles[$serviceUrl] = $handle;
    }

    do {
        $multiStatus = curl_multi_exec($multiHandle, $running);
        if ($running > 0 && curl_multi_select($multiHandle, 1.0) === -1) {
            usleep(100000);
        }
    } while ($running > 0 && $multiStatus === CURLM_OK);

    $results = [];
    foreach ($handles as $serviceUrl => $handle) {
        $curlError = curl_errno($handle);
        $httpStatus = (int) curl_getinfo($handle, CURLINFO_HTTP_CODE);
        $contentType = (string) curl_getinfo($handle, CURLINFO_CONTENT_TYPE);
        $error = '';
        if ($states[$serviceUrl]['too_large']) {
            $error = 'response_too_large';
        } elseif ($curlError !== CURLE_OK) {
            $error = 'network_error_' . $curlError;
        } elseif ($httpStatus < 200 || $httpStatus >= 300) {
            $error = 'http_' . $httpStatus;
        }

        $results[$serviceUrl] = [
            'body' => $states[$serviceUrl]['body'],
            'status' => $httpStatus,
            'content_type' => $contentType,
            'error' => $error,
        ];
        curl_multi_remove_handle($multiHandle, $handle);
        curl_close($handle);
    }
    curl_multi_close($multiHandle);

    return $results;
}

/**
 * Baixa um lote limitado de documentos GetCapabilities.
 *
 * @param array<string, string> $urls Mapa entre serviço e URL de capacidades.
 * @return array<string, array{body: string, status: int, content_type: string, error: string}>
 */
function fetchCapabilitiesBatch(array $urls): array
{
    return fetchHttpBatch($urls, MAX_CAPABILITIES_BYTES);
}

/**
 * Escolhe um formato de resposta que o coletor consegue resumir.
 *
 * @param array<int, string> $formats Formatos anunciados pelo WMS.
 */
function chooseFeatureInfoFormat(array $formats): string
{
    foreach (['application/json', 'application/geo+json', 'text/plain', 'text/html', 'application/vnd.ogc.gml', 'text/xml'] as $preferred) {
        foreach ($formats as $format) {
            if (strcasecmp($format, $preferred) === 0) {
                return $format;
            }
        }
    }

    return '';
}

/**
 * Cria uma consulta pontual GetFeatureInfo no centro da extensão geográfica da camada.
 *
 * @param string $serviceUrl URL do serviço WMS.
 * @param string $version Versão anunciada pelo WMS.
 * @param array<string, mixed> $layer Metadados da camada.
 * @param string $infoFormat Formato escolhido para a resposta.
 */
function buildFeatureInfoUrl(string $serviceUrl, string $version, array $layer, string $infoFormat): string
{
    $parts = parse_url($serviceUrl);
    $bbox = $layer['bbox'] ?? null;
    $crsValues = array_map('strtoupper', $layer['crs'] ?? []);
    $isWms13 = str_starts_with($version, '1.3');
    $crs = in_array('CRS:84', $crsValues, true)
        ? 'CRS:84'
        : (in_array('EPSG:4326', $crsValues, true) ? 'EPSG:4326' : '');

    if (!$parts || !$bbox || $crs === '' || $infoFormat === '') {
        throw new RuntimeException('feature_info_not_supported');
    }

    $coordinates = [$bbox['minx'], $bbox['miny'], $bbox['maxx'], $bbox['maxy']];
    if ($isWms13 && $crs === 'EPSG:4326') {
        $coordinates = [$bbox['miny'], $bbox['minx'], $bbox['maxy'], $bbox['maxx']];
    }

    $query = [];
    parse_str($parts['query'] ?? '', $query);
    foreach (array_keys($query) as $key) {
        if (in_array(strtoupper((string) $key), [
            'SERVICE', 'REQUEST', 'VERSION', 'LAYERS', 'QUERY_LAYERS', 'STYLES', 'SRS', 'CRS',
            'BBOX', 'WIDTH', 'HEIGHT', 'FORMAT', 'INFO_FORMAT', 'X', 'Y', 'I', 'J', 'FEATURE_COUNT'
        ], true)) {
            unset($query[$key]);
        }
    }

    $version = $isWms13 ? '1.3.0' : '1.1.1';
    $params = [
        'SERVICE' => 'WMS',
        'VERSION' => $version,
        'REQUEST' => 'GetFeatureInfo',
        'LAYERS' => $layer['name'],
        'QUERY_LAYERS' => $layer['name'],
        'STYLES' => '',
        'BBOX' => implode(',', array_map(static fn ($value): string => sprintf('%.8F', (float) $value), $coordinates)),
        'WIDTH' => '101',
        'HEIGHT' => '101',
        'FORMAT' => 'image/png',
        'INFO_FORMAT' => $infoFormat,
        'FEATURE_COUNT' => '3',
    ];

    if ($isWms13) {
        $params['CRS'] = $crs;
        $params['I'] = '50';
        $params['J'] = '50';
    } else {
        $params['SRS'] = $crs;
        $params['X'] = '50';
        $params['Y'] = '50';
    }

    $url = strtolower($parts['scheme']) . '://' . $parts['host'];
    if (isset($parts['port'])) {
        $url .= ':' . $parts['port'];
    }
    $url .= $parts['path'] ?? '/';

    return $url . '?' . http_build_query(array_merge($query, $params), '', '&', PHP_QUERY_RFC3986);
}

/**
 * Escolhe uma amostra justa de camadas consultáveis respeitando limites globais e por serviço.
 *
 * @param array<string, array<string, mixed>> $catalogResults Metadados agregados por URL WMS.
 * @return array<int, array{service_url: string, layer_index: int, format: string, request_url: string}>
 */
function selectFeatureInfoTargets(array &$catalogResults): array
{
    $byService = [];
    foreach ($catalogResults as $serviceUrl => &$serviceResult) {
        if ($serviceResult['error'] !== '') {
            continue;
        }

        foreach ($serviceResult['layers'] as $index => &$layer) {
            $layer['feature_info'] = ['status' => 'not_queryable', 'format' => '', 'fields' => '', 'sample' => ''];
            if ($layer['queryable'] !== '1') {
                continue;
            }

            $format = chooseFeatureInfoFormat($serviceResult['info_formats']);
            if ($format === '') {
                $layer['feature_info']['status'] = 'unsupported_format';
                continue;
            }
            if ($layer['bbox'] === null) {
                $layer['feature_info']['status'] = 'missing_geographic_bounds';
                continue;
            }
            if (!in_array('EPSG:4326', $layer['crs'], true) && !in_array('CRS:84', $layer['crs'], true)) {
                $layer['feature_info']['status'] = 'unsupported_geographic_crs';
                continue;
            }

            try {
                $requestUrl = buildFeatureInfoUrl($serviceUrl, $serviceResult['version'], $layer, $format);
            } catch (Throwable $error) {
                $layer['feature_info']['status'] = 'unsupported_request';
                continue;
            }

            $layer['feature_info'] = ['status' => 'skipped_limit', 'format' => $format, 'fields' => '', 'sample' => ''];
            $suggestion = suggestLayerTheme($layer);
            $theme = $suggestion['theme'] !== '' ? $suggestion['theme'] : 'não triado';
            preg_match_all('/\b(?:19|20)\d{2}\b/u', implode(' ', [$layer['name'], $layer['title'], $layer['abstract']]), $years);
            $byService[$serviceUrl][$theme][] = [
                'service_url' => $serviceUrl,
                'layer_index' => $index,
                'format' => $format,
                'request_url' => $requestUrl,
                'latest_year' => $years[0] === [] ? 0 : max(array_map('intval', $years[0])),
                'description_length' => strlen($layer['abstract']),
                'stable_order' => crc32($layer['name']),
            ];
        }
        unset($layer);
    }
    unset($serviceResult);

    $themeOrder = [
        'Hidrografia e recursos hídricos', 'Transporte terrestre', 'Transporte aquaviário',
        'Aviação e aeródromos', 'Relevo e terreno', 'Energia e combustíveis', 'Telecomunicações',
        'Riscos e resposta a emergências', 'População e ocupação', 'Saúde e apoio à população',
        'Território e meio ambiente', 'Geologia e recursos minerais', 'não triado',
    ];
    foreach ($byService as &$groups) {
        foreach ($groups as &$targets) {
            usort($targets, static function (array $left, array $right): int {
                return [-$left['latest_year'], -$left['description_length'], $left['stable_order']]
                    <=> [-$right['latest_year'], -$right['description_length'], $right['stable_order']];
            });
        }
        unset($targets);

        uksort($groups, static function (string $left, string $right) use ($themeOrder): int {
            return array_search($left, $themeOrder, true) <=> array_search($right, $themeOrder, true);
        });
        $diverseTargets = [];
        for ($round = 0; ; $round++) {
            $hasMore = false;
            foreach ($groups as $targets) {
                if (isset($targets[$round])) {
                    $diverseTargets[] = $targets[$round];
                    $hasMore = true;
                }
            }
            if (!$hasMore) {
                break;
            }
        }
        $groups = $diverseTargets;
    }
    unset($targets);

    $selected = [];
    for ($round = 0; $round < MAX_FEATURE_INFO_PER_SERVICE && count($selected) < MAX_FEATURE_INFO_REQUESTS; $round++) {
        foreach ($byService as $targets) {
            if (isset($targets[$round]) && count($selected) < MAX_FEATURE_INFO_REQUESTS) {
                $target = $targets[$round];
                $catalogResults[$target['service_url']]['layers'][$target['layer_index']]['feature_info']['status'] = 'pending';
                $selected[] = $target;
            }
        }
    }

    return $selected;
}

/**
 * Converte respostas JSON, HTML ou texto de GetFeatureInfo em atributos e uma amostra curta.
 *
 * @param string $body Conteúdo devolvido pelo serviço.
 * @param string $contentType Tipo de conteúdo HTTP.
 * @return array{fields: string, sample: string}
 */
function parseFeatureInfoResponse(string $body, string $contentType): array
{
    if (preg_match('/<ServiceException|<ExceptionReport/i', $body)) {
        return ['fields' => '', 'sample' => '', 'error' => 'service_exception'];
    }

    $properties = [];
    if (stripos($contentType, 'json') !== false || preg_match('/^\s*[\[{]/', $body)) {
        $decoded = json_decode($body, true);
        if (is_array($decoded)) {
            $rows = [];
            collectJsonFeatureProperties($decoded, $rows);
            $properties = $rows[0] ?? [];
        }
    } elseif (stripos($contentType, 'html') !== false || preg_match('/<html|<table|<tr\b/i', $body)) {
        $document = new DOMDocument();
        $previousErrorMode = libxml_use_internal_errors(true);
        try {
            if ($document->loadHTML($body, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING)) {
                $xpath = new DOMXPath($document);
                foreach ($xpath->query('//tr') ?: [] as $row) {
                    $cells = $xpath->query('./th|./td', $row);
                    if ($cells && $cells->length >= 2) {
                        for ($index = 0; $index + 1 < $cells->length; $index += 2) {
                            $key = trim($cells->item($index)->textContent);
                            $value = trim($cells->item($index + 1)->textContent);
                            if ($key !== '' && $value !== '') {
                                $properties[$key] = $value;
                            }
                        }
                    }
                }
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previousErrorMode);
        }
    } elseif (preg_match('/<\?xml|<FeatureInfoCollection|<FeatureCollection/i', $body)) {
        $document = new DOMDocument();
        $previousErrorMode = libxml_use_internal_errors(true);
        try {
            if ($document->loadXML($body, LIBXML_NONET | LIBXML_NOBLANKS)) {
                $xpath = new DOMXPath($document);
                foreach ($xpath->query('//*[not(*) and normalize-space(.) != ""]') ?: [] as $node) {
                    $name = $node->localName;
                    if (!preg_match('/^(?:gml|geometry|geom|the_geom|boundedBy|pos|posList|coordinates)$/i', $name)) {
                        $properties[$name] = trim($node->textContent);
                    }
                }
            }
        } finally {
            libxml_clear_errors();
            libxml_use_internal_errors($previousErrorMode);
        }
    } else {
        foreach (preg_split('/\r?\n/', $body) ?: [] as $line) {
            if (preg_match('/^\s*([^:=]{1,100})\s*[:=]\s*(.*?)\s*$/u', $line, $matches)
                && trim($matches[2]) !== '') {
                $properties[trim($matches[1])] = trim($matches[2]);
            }
        }
        if ($properties === []) {
            $text = trim(html_entity_decode(strip_tags($body), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if ($text !== '') {
                $properties['response'] = $text;
            }
        }
    }

    $properties = normalizeFeatureProperties($properties);

    return [
        'fields' => implode(' | ', array_keys($properties)),
        'sample' => $properties === [] ? '' : (string) json_encode($properties, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'error' => '',
    ];
}

/**
 * Procura propriedades em objetos de feições GeoJSON e formatos JSON similares.
 *
 * @param array<mixed> $value Estrutura JSON decodificada.
 * @param array<int, array<string, mixed>> $rows Propriedades encontradas.
 */
function collectJsonFeatureProperties(array $value, array &$rows): void
{
    if (isset($value['properties']) && is_array($value['properties'])) {
        $rows[] = $value['properties'];
        return;
    }

    foreach ($value as $child) {
        if (is_array($child)) {
            collectJsonFeatureProperties($child, $rows);
        }
    }
}

/**
 * Limita nomes e valores armazenados na planilha.
 *
 * @param array<string, mixed> $properties Atributos originais de uma feição.
 * @return array<string, string>
 */
function normalizeFeatureProperties(array $properties): array
{
    $normalized = [];
    foreach ($properties as $key => $value) {
        if (is_array($value) || is_object($value) || $value === null) {
            continue;
        }
        $name = trim((string) $key);
        $text = trim((string) $value);
        if ($name !== '' && $text !== '' && count($normalized) < 20) {
            $normalized[substr($name, 0, 100)] = substr($text, 0, 240);
        }
    }

    return $normalized;
}

/**
 * Abre o banco em modo somente leitura e reconhece o esquema legado ou migrado.
 *
 * @param string $databasePath Caminho do SQLite.
 * @return array<int, array{id: int, name: string, url: string}>
 */
function readWmsServices(string $databasePath): array
{
    $absolutePath = realpath($databasePath);
    if ($absolutePath === false) {
        throw new RuntimeException('database_not_found');
    }

    $database = new PDO('sqlite:file:' . $absolutePath . '?mode=ro', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $tables = $database->query("SELECT name FROM sqlite_master WHERE type = 'table'")->fetchAll(PDO::FETCH_COLUMN);
    if (in_array('map_services', $tables, true)) {
        $table = 'map_services';
        $nameColumn = 'name';
        $urlColumn = 'url';
    } elseif (in_array('sigs', $tables, true)) {
        $table = 'sigs';
        $nameColumn = 'Nome';
        $urlColumn = 'URL';
    } else {
        throw new RuntimeException('service_table_not_found');
    }

    $statement = $database->query(
        'SELECT id, "' . $nameColumn . '" AS name, "' . $urlColumn . '" AS url FROM "' . $table . '" ORDER BY id'
    );

    return $statement->fetchAll();
}

/**
 * Sugere tema e relevância preliminar usando somente metadados textuais publicados pelo WMS.
 *
 * @param array{name: string, title: string, abstract: string, keywords: array<int, string>} $layer Metadados da camada.
 * @return array{theme: string, relevance: string, notes: string, review_status: string}
 */
function suggestLayerTheme(array $layer): array
{
    $featureInfo = $layer['feature_info'] ?? ['fields' => '', 'sample' => ''];
    $featureInfoText = implode(' ', [$featureInfo['fields'], $featureInfo['sample']]);
    $metadata = implode(' ', [
        $layer['name'], $layer['title'], $layer['abstract'], implode(' ', $layer['keywords']), $featureInfoText
    ]);
    $themes = [
        'Aviação e aeródromos' => '/aeroport|aer[oó]drom|pista|heliponto|aeron[aá]utic/iu',
        'Transporte terrestre' => '/rodov|estrad|ferrov|ferrovia|ponte|t[uú]nel|malha vi[aá]ria|via urbana/iu',
        'Transporte aquaviário' => '/porto|navega[cç][aã]o|mar[ií]tim|hidrovia|terminal portu[aá]rio/iu',
        'Hidrografia e recursos hídricos' => '/hidrograf|bacia hidrogr[aá]fica|demanda h[ií]drica|uso consuntivo|vaz[aã]o|outorga|disponibilidade h[ií]drica|seguran[cç]a h[ií]drica|(?<![A-Z0-9_])VZ[A-Z0-9_]*M3S(?![A-Z0-9_])|(?<![\p{L}\p{N}_])rios?(?![\p{L}\p{N}_])|reservat[oó]rio|barragem|nascente|capta[cç][aã]o|abastecimento de [aá]gua/iu',
        'Energia e combustíveis' => '/petr[oó]leo|g[aá]s natural|gasoduto|oleoduto|combust[ií]vel|refinaria|energia|hidrel[eé]tric|usina|linha de transmiss[aã]o|subesta[cç][aã]o/iu',
        'Telecomunicações' => '/telecom|antena|transmissor|torre|radiodifus[aã]o|fibra [oó]ptica/iu',
        'Relevo e terreno' => '/altitude|eleva[cç][aã]o|modelo digital de (terreno|eleva[cç][aã]o)|\bmd[et]\b|declividade|curvas? de n[ií]vel|relevo|geomorf/iu',
        'População e ocupação' => '/popula[cç][aã]o|censo|domic[ií]lio|assentamento|urbaniza[cç][aã]o|[aá]rea urbana|edifica[cç][aã]o|edif[ií]cio/iu',
        'Riscos e resposta a emergências' => '/inunda[cç][aã]o|enchente|alagamento|deslizamento|defesa civil|inc[eê]ndio|risco|desastre|emerg[eê]ncia|seca/iu',
        'Geologia e recursos minerais' => '/geologia|minera[cç][aã]o|recurso mineral|dep[oó]sito mineral/iu',
        'Território e meio ambiente' => '/fronteira|limite internacional|terra ind[ií]gena|[aá]rea protegida|unidade de conserva[cç][aã]o|vegeta[cç][aã]o|desmatamento|uso do solo/iu',
        'Saúde e apoio à população' => '/sa[uú]de|hospital|unidade de sa[uú]de/iu',
    ];

    foreach ($themes as $theme => $pattern) {
        if (preg_match_all($pattern, $metadata, $matches) && $matches[0] !== []) {
            $evidence = array_values(array_unique(array_slice($matches[0], 0, 4)));
            $evidenceSource = 'Metadados WMS';
            foreach ($evidence as $item) {
                if ($featureInfoText !== '' && stripos($featureInfoText, $item) !== false) {
                    $evidenceSource = 'GetFeatureInfo';
                    break;
                }
            }
            return [
                'theme' => $theme,
                'relevance' => 'potencialmente relevante',
                'notes' => $evidenceSource . ' indica: ' . implode(', ', $evidence) . '. Confirmar conteúdo e cobertura.',
                'review_status' => 'revisão humana pendente',
            ];
        }
    }

    return [
        'theme' => '',
        'relevance' => 'não triado',
        'notes' => 'Nenhum termo de triagem identificado nos metadados; isso não indica irrelevância.',
        'review_status' => 'revisão humana pendente',
    ];
}

/**
 * Gera o CSV de metadados e deixa a classificação para a revisão humana/assistida.
 *
 * @param array<int, array{id: int, name: string, url: string}> $services Serviços lidos do SQLite.
 * @param string $outputPath Caminho do CSV de revisão.
 */
function writeReviewCsv(array $services, string $outputPath, array $catalogResults): array
{
    $directory = dirname($outputPath);
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('output_directory_unavailable');
    }

    $file = fopen($outputPath, 'wb');
    if ($file === false) {
        throw new RuntimeException('output_unavailable');
    }

    fwrite($file, "\xEF\xBB\xBF");
    fputcsv($file, [
        'service_id', 'service_name', 'service_host', 'layer_name', 'layer_title', 'abstract', 'keywords',
        'queryable', 'collection_status', 'collection_error', 'theme_suggestion', 'military_relevance',
        'review_notes', 'review_status', 'feature_info_status', 'feature_info_format',
        'feature_info_fields', 'feature_info_sample'
    ], ';', '"', '\\');

    $layerCount = 0;
    $failedServices = 0;
    foreach ($services as $service) {
        $host = parse_url($service['url'], PHP_URL_HOST) ?: '';
        $result = $catalogResults[$service['url']] ?? ['layers' => [], 'error' => 'not_collected'];

        if ($result['error'] !== '') {
            $failedServices++;
            fputcsv($file, [
                $service['id'], $service['name'], $host, '', '', '', '', '', 'error', $result['error'], '', '', '',
                'revisão humana pendente', 'service_error', '', '', ''
            ], ';', '"', '\\');
            continue;
        }

        foreach ($result['layers'] as $layer) {
            $layerCount++;
            $suggestion = suggestLayerTheme($layer);
            $featureInfo = $layer['feature_info'] ?? [
                'status' => $layer['queryable'] === '1' ? 'not_collected' : 'not_queryable',
                'format' => '',
                'fields' => '',
                'sample' => '',
            ];
            fputcsv($file, [
                $service['id'], $service['name'], $host, $layer['name'], $layer['title'], $layer['abstract'],
                implode(' | ', $layer['keywords']), $layer['queryable'], 'ok', '', $suggestion['theme'],
                $suggestion['relevance'], $suggestion['notes'], $suggestion['review_status'], $featureInfo['status'],
                $featureInfo['format'], $featureInfo['fields'], $featureInfo['sample']
            ], ';', '"', '\\');
        }
    }
    fclose($file);

    return ['layers' => $layerCount, 'failed_services' => $failedServices];
}

/**
 * Executa a coleta manual, limitada e somente leitura.
 */
function runCatalog(): int
{
    $projectRoot = dirname(__DIR__);
    $databasePath = getenv('PLANMILT_DB_PATH') ?: $projectRoot . '/bd.db';
    $outputPath = $GLOBALS['argv'][1] ?? $projectRoot . '/storage/wms-layer-review.csv';

    try {
        $services = readWmsServices($databasePath);
        $uniqueUrls = [];
        foreach ($services as $service) {
            if (!array_key_exists($service['url'], $uniqueUrls)) {
                try {
                    $uniqueUrls[$service['url']] = ['request_url' => buildCapabilitiesUrl($service['url'])];
                } catch (Throwable $error) {
                    $uniqueUrls[$service['url']] = ['request_url' => '', 'error' => 'invalid_service_url'];
                }
            }
        }

        $catalogResults = [];
        $validRequests = [];
        foreach ($uniqueUrls as $serviceUrl => $item) {
            if ($item['request_url'] === '') {
                $catalogResults[$serviceUrl] = ['layers' => [], 'error' => $item['error']];
            } else {
                $validRequests[$serviceUrl] = $item['request_url'];
            }
        }

        foreach (array_chunk($validRequests, MAX_CONCURRENT_REQUESTS, true) as $batch) {
            foreach (fetchCapabilitiesBatch($batch) as $serviceUrl => $result) {
                if ($result['error'] !== '') {
                    $catalogResults[$serviceUrl] = ['layers' => [], 'error' => $result['error']];
                    continue;
                }

                try {
                    $capabilities = WmsCapabilitiesParser::parse($result['body']);
                    $catalogResults[$serviceUrl] = [
                        'layers' => $capabilities['layers'],
                        'version' => $capabilities['version'],
                        'info_formats' => $capabilities['info_formats'],
                        'error' => $capabilities['layers'] === [] ? 'no_named_layers' : '',
                    ];
                } catch (Throwable $error) {
                    $catalogResults[$serviceUrl] = ['layers' => [], 'error' => 'invalid_capabilities'];
                }
            }
        }

        $featureInfoTargets = selectFeatureInfoTargets($catalogResults);
        $featureInfoRequests = [];
        foreach ($featureInfoTargets as $index => $target) {
            $featureInfoRequests[(string) $index] = $target['request_url'];
        }

        foreach (array_chunk($featureInfoRequests, MAX_CONCURRENT_REQUESTS, true) as $batch) {
            foreach (fetchHttpBatch($batch, MAX_FEATURE_INFO_BYTES) as $index => $result) {
                $target = $featureInfoTargets[(int) $index];
                $layer = &$catalogResults[$target['service_url']]['layers'][$target['layer_index']];
                if ($result['error'] !== '') {
                    $layer['feature_info']['status'] = $result['error'];
                } else {
                    $parsed = parseFeatureInfoResponse($result['body'], $result['content_type']);
                    $layer['feature_info']['fields'] = $parsed['fields'];
                    $layer['feature_info']['sample'] = $parsed['sample'];
                    $layer['feature_info']['status'] = $parsed['error'] !== ''
                        ? $parsed['error']
                        : ($parsed['sample'] === '' ? 'no_features_at_sample' : 'sample_received');
                }
                unset($layer);
            }
        }

        $summary = writeReviewCsv($services, $outputPath, $catalogResults);
        $featureInfoCounts = [];
        foreach ($catalogResults as $serviceResult) {
            foreach ($serviceResult['layers'] as $layer) {
                $status = $layer['feature_info']['status'] ?? 'service_error';
                $featureInfoCounts[$status] = ($featureInfoCounts[$status] ?? 0) + 1;
            }
        }
        $featureInfoFailures = 0;
        foreach ($featureInfoTargets as $target) {
            $status = $catalogResults[$target['service_url']]['layers'][$target['layer_index']]['feature_info']['status'];
            if (str_starts_with($status, 'http_') || str_starts_with($status, 'network_error_')
                || in_array($status, ['response_too_large', 'service_exception'], true)) {
                $featureInfoFailures++;
            }
        }
        printf(
            "Serviços: %d | URLs consultadas: %d | Camadas: %d | Serviços com falha: %d\n",
            count($services), count($uniqueUrls), $summary['layers'], $summary['failed_services']
        );
        printf(
            "GetFeatureInfo: %d amostras | %d respostas com dados | %d sem feição no ponto | %d falhas | %d elegíveis fora do limite\nCSV: %s\n",
            count($featureInfoTargets), $featureInfoCounts['sample_received'] ?? 0,
            $featureInfoCounts['no_features_at_sample'] ?? 0, $featureInfoFailures,
            $featureInfoCounts['skipped_limit'] ?? 0, $outputPath
        );

        return 0;
    } catch (Throwable $error) {
        fwrite(STDERR, "Falha na coleta: " . $error->getMessage() . PHP_EOL);
        return 1;
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    exit(runCatalog());
}