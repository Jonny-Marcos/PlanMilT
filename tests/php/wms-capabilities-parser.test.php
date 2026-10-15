<?php
declare(strict_types=1);

use PlanMilT\Tools\WmsCapabilitiesParser;

require_once dirname(__DIR__, 2) . '/tools/WmsCapabilitiesParser.php';
require_once dirname(__DIR__, 2) . '/tools/catalog-wms-layers.php';

$xml = <<<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
  <Capability>
    <Request><GetFeatureInfo><Format>application/json</Format><Format>text/plain</Format></GetFeatureInfo></Request>
    <Layer queryable="1">
      <CRS>EPSG:4326</CRS>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>-51</westBoundLongitude><eastBoundLongitude>-44</eastBoundLongitude>
        <southBoundLatitude>-24</southBoundLatitude><northBoundLatitude>-18</northBoundLatitude>
      </EX_GeographicBoundingBox>
      <Title>Camadas</Title>
      <Layer>
        <Name>roads</Name>
        <Title>  Rede   viária </Title>
        <Abstract>Vias e rodovias</Abstract>
        <KeywordList><Keyword>transporte</Keyword><Keyword>infraestrutura</Keyword></KeywordList>
      </Layer>
      <Layer queryable="0"><Name>terrain</Name><Title>Relevo</Title></Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>
XML;

$capabilities = WmsCapabilitiesParser::parse($xml);
$layers = $capabilities['layers'];
if ($capabilities['version'] !== '1.3.0'
  || $capabilities['info_formats'] !== ['application/json', 'text/plain']
  || count($layers) !== 2
    || $layers[0]['name'] !== 'roads'
    || $layers[0]['title'] !== 'Rede viária'
    || $layers[0]['abstract'] !== 'Vias e rodovias'
    || $layers[0]['keywords'] !== ['transporte', 'infraestrutura']
    || $layers[0]['queryable'] !== '1'
    || $layers[0]['crs'] !== ['EPSG:4326']
    || $layers[0]['bbox'] !== ['minx' => -51.0, 'miny' => -24.0, 'maxx' => -44.0, 'maxy' => -18.0]
    || $layers[1]['queryable'] !== '0') {
    throw new RuntimeException('WMS metadata parsing regression.');
}

  $featureInfoUrl = buildFeatureInfoUrl('https://maps.example/wms?map=base', $capabilities['version'], $layers[0], 'application/json');
  $featureInfoQuery = [];
  parse_str((string) parse_url($featureInfoUrl, PHP_URL_QUERY), $featureInfoQuery);
  if ($featureInfoQuery['REQUEST'] !== 'GetFeatureInfo'
    || $featureInfoQuery['QUERY_LAYERS'] !== 'roads'
    || $featureInfoQuery['CRS'] !== 'EPSG:4326'
    || $featureInfoQuery['BBOX'] !== '-24.00000000,-51.00000000,-18.00000000,-44.00000000'
    || $featureInfoQuery['I'] !== '50'
    || $featureInfoQuery['J'] !== '50') {
    throw new RuntimeException('WMS 1.3 axis order or GetFeatureInfo request regression.');
  }

try {
    WmsCapabilitiesParser::parse('<ServiceExceptionReport/>');
    throw new RuntimeException('Expected invalid WMS document to be rejected.');
} catch (InvalidArgumentException $error) {
    // Esperado: a resposta não é um documento WMS GetCapabilities.
}

echo "WMS capabilities parser tests passed.\n";

$targetsByService = [];
for ($serviceIndex = 0; $serviceIndex < 21; $serviceIndex++) {
  $url = 'https://maps' . $serviceIndex . '.example/wms';
  $layersForService = [];
  for ($layerIndex = 0; $layerIndex < 20; $layerIndex++) {
    $layersForService[] = [
      'name' => 'layer_' . $layerIndex,
      'title' => 'Dados gerais ' . $layerIndex,
      'abstract' => '',
      'keywords' => [],
      'queryable' => '1',
      'crs' => ['EPSG:4326'],
      'bbox' => ['minx' => -51.0, 'miny' => -24.0, 'maxx' => -44.0, 'maxy' => -18.0],
    ];
  }
  $targetsByService[$url] = [
    'layers' => $layersForService,
    'version' => '1.3.0',
    'info_formats' => ['application/json'],
    'error' => '',
  ];
}
$selectedTargets = selectFeatureInfoTargets($targetsByService);
$selectedPerService = [];
$skippedCount = 0;
foreach ($targetsByService as $serviceUrl => $serviceResult) {
  foreach ($serviceResult['layers'] as $layer) {
    if ($layer['feature_info']['status'] === 'pending') {
      $selectedPerService[$serviceUrl] = ($selectedPerService[$serviceUrl] ?? 0) + 1;
    } elseif ($layer['feature_info']['status'] === 'skipped_limit') {
      $skippedCount++;
    }
  }
}
if (count($selectedTargets) !== MAX_FEATURE_INFO_REQUESTS || $skippedCount !== 220
  || max($selectedPerService) > MAX_FEATURE_INFO_PER_SERVICE) {
  throw new RuntimeException('FeatureInfo sampling limits or service fairness regression.');
}

$diverseCatalog = ['https://diverse.example/wms' => [
  'version' => '1.3.0',
  'info_formats' => ['application/json'],
  'error' => '',
  'layers' => [],
]];
foreach ([
  ['name' => 'water_1980', 'title' => 'Demanda hídrica 1980'],
  ['name' => 'water_2040', 'title' => 'Demanda hídrica 2040'],
  ['name' => 'roads', 'title' => 'Rodovias federais'],
  ['name' => 'unknown', 'title' => 'Dados gerais'],
] as $layer) {
  $diverseCatalog['https://diverse.example/wms']['layers'][] = $layer + [
    'abstract' => '',
    'keywords' => [],
    'queryable' => '1',
    'crs' => ['EPSG:4326'],
    'bbox' => ['minx' => -51.0, 'miny' => -24.0, 'maxx' => -44.0, 'maxy' => -18.0],
  ];
}
$diverseTargets = selectFeatureInfoTargets($diverseCatalog);
$sampledThemes = [];
$sampledNames = [];
foreach ($diverseTargets as $target) {
  $layer = $diverseCatalog[$target['service_url']]['layers'][$target['layer_index']];
  $sampledThemes[] = suggestLayerTheme($layer)['theme'] ?: 'não triado';
  $sampledNames[] = $layer['name'];
}
if (count(array_unique($sampledThemes)) !== 3 || $sampledNames[0] !== 'water_2040') {
  throw new RuntimeException('FeatureInfo sampling should include diverse themes before repeated layers.');
}

$requestUrl = buildCapabilitiesUrl('https://maps.example/geoserver/wms?map=base&SERVICE=WFS&REQUEST=GetMap&token=secret');
if ($requestUrl !== 'https://maps.example/geoserver/wms?map=base&token=secret&SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0') {
  throw new RuntimeException('WMS GetCapabilities URL construction regression.');
}

$databasePath = tempnam(sys_get_temp_dir(), 'planmilt-wms-db-');
if ($databasePath === false) {
  throw new RuntimeException('Unable to create temporary SQLite database.');
}

try {
  $database = new PDO('sqlite:' . $databasePath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
  $database->exec('CREATE TABLE sigs (id INTEGER PRIMARY KEY, Nome TEXT, URL TEXT)');
  $database->exec("INSERT INTO sigs (Nome, URL) VALUES ('Serviço de teste', 'https://maps.example/wms')");
  unset($database);

  $services = readWmsServices($databasePath);
  $verificationDatabase = new PDO('sqlite:' . $databasePath);
  if (count($services) !== 1 || $services[0]['name'] !== 'Serviço de teste'
    || $verificationDatabase->query('PRAGMA user_version')->fetchColumn() !== 0
    || $verificationDatabase->query("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'sigs'")->fetchColumn() !== 1) {
    throw new RuntimeException('SQLite read-only access or legacy schema compatibility regression.');
  }
} finally {
  unlink($databasePath);
}

$csvPath = tempnam(sys_get_temp_dir(), 'planmilt-wms-csv-');
if ($csvPath === false) {
  throw new RuntimeException('Unable to create temporary CSV file.');
}

try {
  $summary = writeReviewCsv(
    [['id' => 1, 'name' => 'Serviço; de teste', 'url' => 'https://maps.example/wms']],
    $csvPath,
    ['https://maps.example/wms' => [
      'error' => '',
      'layers' => [[
        'name' => 'roads',
        'title' => 'Rede viária; principal',
        'abstract' => 'Ruas e rodovias',
        'keywords' => ['transporte'],
        'queryable' => '1',
      ]],
    ]]
  );
  $csv = fopen($csvPath, 'rb');
  fread($csv, 3);
  $header = fgetcsv($csv, 0, ';', '"', '\\');
  $row = fgetcsv($csv, 0, ';', '"', '\\');
  fclose($csv);

  if ($summary !== ['layers' => 1, 'failed_services' => 0]
    || $row[1] !== 'Serviço; de teste'
    || $row[4] !== 'Rede viária; principal'
    || $row[10] !== 'Transporte terrestre'
    || $row[11] !== 'potencialmente relevante'
    || $row[13] !== 'revisão humana pendente'
    || $row[14] !== 'not_collected'
    || count($header) !== 18) {
    throw new RuntimeException('CSV generation or escaping regression.');
  }

  $untriaged = suggestLayerTheme([
    'name' => 'layer_001',
    'title' => 'Dados gerais',
    'abstract' => '',
    'keywords' => [],
  ]);
  if ($untriaged['relevance'] !== 'não triado'
    || !str_contains($untriaged['notes'], 'não indica irrelevância')) {
    throw new RuntimeException('Unmatched metadata must not be treated as irrelevant.');
  }

  $featureInfo = parseFeatureInfoResponse(
    '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"NMEST":"SP","NMMUN":"Avanhandava","VZTOTM3S":0.233816}}]}',
    'application/json'
  );
  $waterLayer = suggestLayerTheme([
    'name' => 'water_demand',
    'title' => 'Dados por município',
    'abstract' => '',
    'keywords' => [],
    'feature_info' => $featureInfo,
  ]);
  if ($featureInfo['fields'] !== 'NMEST | NMMUN | VZTOTM3S'
    || $waterLayer['theme'] !== 'Hidrografia e recursos hídricos'
    || !str_contains($waterLayer['notes'], 'GetFeatureInfo')) {
    throw new RuntimeException('GetFeatureInfo attributes should inform the suggested theme.');
  }

  $territory = suggestLayerTheme([
    'name' => 'territorios_municipais',
    'title' => 'Territórios municipais',
    'abstract' => '',
    'keywords' => [],
  ]);
  $river = suggestLayerTheme([
    'name' => 'rio_principal',
    'title' => 'Rio principal',
    'abstract' => '',
    'keywords' => [],
  ]);
  if ($territory['theme'] === 'Hidrografia e recursos hídricos'
    || $river['theme'] !== 'Hidrografia e recursos hídricos') {
    throw new RuntimeException('Hydrography matching must not match substrings inside unrelated words.');
  }
} finally {
  unlink($csvPath);
}

echo "WMS catalog collection tests passed.\n";