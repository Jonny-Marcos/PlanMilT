<?php
// elevation_profile.php

ini_set('display_errors', 1);
error_reporting(E_ALL);

// Função para registrar logs
function writeLog($message) {
    file_put_contents('logfile.log', date('Y-m-d H:i:s') . ' - ' . $message . PHP_EOL, FILE_APPEND);
}

// Função para calcular a distância haversine entre dois pontos
function haversine($lat1, $lon1, $lat2, $lon2) {
    $earthRadius = 6371; // Raio da Terra em km

    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);

    $a = sin($dLat/2) * sin($dLat/2) +
        cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
        sin($dLon/2) * sin($dLon/2);
    $c = 2 * atan2(sqrt($a), sqrt(1-$a));

    $distance = $earthRadius * $c;
    return $distance;
}

// Função para obter o nome do tile SRTM correspondente a uma latitude e longitude
function getSRTMTile($lat, $lon) {
    $latDegree = floor($lat);
    $lonDegree = floor($lon);

    $latPrefix = ($latDegree >= 0) ? 'N' : 'S';
    $lonPrefix = ($lonDegree >= 0) ? 'E' : 'W';

    $latDegreeAbs = abs($latDegree);
    $lonDegreeAbs = abs($lonDegree);

    // Formatação correta para garantir dois dígitos para latitude e três para longitude
    $tileName = sprintf("%s%02d%s%03d.HGT",
        $latPrefix, $latDegreeAbs,
        $lonPrefix, $lonDegreeAbs
    );

    return $tileName;
}

// Função para obter a elevação de um ponto a partir de um tile SRTM
function getElevationFromTile($tilePath, $lat, $lon) {
    if (!file_exists($tilePath)) {
        writeLog("Arquivo não encontrado: $tilePath");
        return null;
    }

    // Abrir o arquivo .HGT em modo binário
    $handle = fopen($tilePath, "rb");
    if ($handle === false) {
        writeLog("Falha ao abrir o arquivo: $tilePath");
        return null;
    }

    // Cada tile SRTM3 tem 1201x1201 pontos, com espaçamento de 1/1200 graus
    $size = 1201;
    $delta = 1 / 1200;

    // Obter o nome do tile a partir do caminho completo
    $tileName = basename($tilePath);

    // Extrair os prefixos de latitude e longitude do nome do tile
    $latPrefix = $tileName[0];
    $lonPrefix = $tileName[3];

    // Calcular a latitude e longitude mínimas do tile
    $minLat = ($latPrefix === 'N') ? intval(substr($tileName, 1, 2)) : -intval(substr($tileName, 1, 2));
    $minLon = ($lonPrefix === 'E') ? intval(substr($tileName, 4, 3)) : -intval(substr($tileName, 4, 3));

    // Calcular a posição relativa dentro do tile
    $relativeLat = $lat - $minLat;
    $relativeLon = $lon - $minLon;

    // Verificar se o ponto está dentro dos limites do tile
    if ($relativeLat < 0 || $relativeLat > 1 || $relativeLon < 0 || $relativeLon > 1) {
        fclose($handle);
        writeLog("Ponto fora dos limites do tile: lat=$lat, lon=$lon");
        return null;
    }

    $row = floor((1 - $relativeLat) / $delta);
    $col = floor($relativeLon / $delta);

    // Garantir que a linha e coluna estão dentro dos limites
    if ($row < 0) $row = 0;
    if ($row >= $size) $row = $size - 1;
    if ($col < 0) $col = 0;
    if ($col >= $size) $col = $size - 1;

    writeLog("Ponto: lat=$lat, lon=$lon | Tile: $tilePath | Row: $row | Col: $col");

    // Cada ponto é representado por 2 bytes (big endian)
    $offset = ($row * $size + $col) * 2;
    fseek($handle, $offset);
    $data = fread($handle, 2);
    fclose($handle);

    if (strlen($data) < 2) {
        writeLog("Dados insuficientes no tile: $tilePath | Offset: $offset");
        return null;
    }

    $elevation = unpack("n", $data)[1];
    if ($elevation >= 32768) {
        $elevation -= 65536;
    }

    writeLog("Elevação obtida: $elevation metros | Ponto: lat=$lat, lon=$lon");

    return $elevation;
}

// Processa a requisição POST
$rawData = file_get_contents("php://input");
if (!$rawData) {
    writeLog("Nenhum dado recebido.");
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(['error' => 'No data received']);
    exit;
}

$data = json_decode($rawData, true);
if (!$data || !isset($data['points']) || !is_array($data['points'])) {
    writeLog("Dados inválidos recebidos.");
    header('HTTP/1.1 400 Bad Request');
    echo json_encode(['error' => 'Invalid data format']);
    exit;
}

$points = $data['points'];
$elevationResults = [];

// Caminho para os arquivos SRTM
$srtmDirectory = __DIR__ . "/SRTM3/";

// Verifica se o diretório SRTM3 existe
if (!is_dir($srtmDirectory)) {
    writeLog("Diretório SRTM3 não encontrado: $srtmDirectory");
    header('HTTP/1.1 500 Internal Server Error');
    echo json_encode(['error' => 'SRTM3 directory not found']);
    exit;
}

// Processa cada ponto
foreach ($points as $point) {
    if (!isset($point['latitude']) || !isset($point['longitude'])) {
        writeLog("Ponto com dados incompletos: " . json_encode($point));
        $elevationResults[] = [
            'latitude' => isset($point['latitude']) ? $point['latitude'] : null,
            'longitude' => isset($point['longitude']) ? $point['longitude'] : null,
            'elevation' => 'N/A'
        ];
        continue;
    }

    $lat = floatval($point['latitude']);
    $lon = floatval($point['longitude']);

    // Obter o nome do tile SRTM correspondente
    $tileName = getSRTMTile($lat, $lon);
    $tilePath = $srtmDirectory . $tileName;

    writeLog("Processando ponto: lat=$lat, lon=$lon | Tile: $tileName | Caminho: $tilePath");

    // Obter a elevação do ponto
    $elevation = getElevationFromTile($tilePath, $lat, $lon);

    $elevationResults[] = [
        'latitude' => $lat,
        'longitude' => $lon,
        'elevation' => ($elevation !== null) ? $elevation : 'N/A'
    ];
}

// Retorna os resultados como JSON
header('Content-Type: application/json');
echo json_encode($elevationResults);
?>
