<?php
// get_elevation_data.php

header('Content-Type: application/json');
ini_set('display_errors', 0);
error_reporting(E_ALL);

function writeLog($message) {
    file_put_contents('logfile.log', date('Y-m-d H:i:s') . ' - ' . $message . PHP_EOL, FILE_APPEND);
}

try {
    $minLat = isset($_GET['minLat']) ? floatval($_GET['minLat']) : null;
    $maxLat = isset($_GET['maxLat']) ? floatval($_GET['maxLat']) : null;
    $minLon = isset($_GET['minLon']) ? floatval($_GET['minLon']) : null;
    $maxLon = isset($_GET['maxLon']) ? floatval($_GET['maxLon']) : null;

    if ($minLat === null || $maxLat === null || $minLon === null || $maxLon === null) {
        writeLog("Parâmetros faltando.");
        http_response_code(400);
        echo json_encode(['error' => 'Parâmetros faltando']);
        exit;
    }

    // Limitar a área máxima permitida
    $maxAreaDegrees = 1.0; // Área máxima em graus quadrados
    $areaRequested = abs($maxLat - $minLat) * abs($maxLon - $minLon);
    if ($areaRequested > $maxAreaDegrees) {
        writeLog("Área solicitada muito grande: $areaRequested graus quadrados.");
        http_response_code(400);
        echo json_encode(['error' => 'A área solicitada é muito grande. Por favor, selecione uma área menor.']);
        exit;
    }

    writeLog("Parâmetros recebidos: minLat=$minLat, maxLat=$maxLat, minLon=$minLon, maxLon=$maxLon");

    // Função para determinar quais tiles SRTM são necessários
    function getSRTMTiles($minLat, $maxLat, $minLon, $maxLon) {
        $tiles = [];

        $startLat = floor($minLat);
        $endLat = ceil($maxLat);
        $startLon = floor($minLon);
        $endLon = ceil($maxLon);

        for ($lat = $startLat; $lat < $endLat; $lat++) {
            for ($lon = $startLon; $lon < $endLon; $lon++) {
                $tileName = sprintf("%s%02d%s%03d.HGT",
                                    ($lat >= 0 ? 'N' : 'S'), abs($lat),
                                    ($lon >= 0 ? 'E' : 'W'), abs($lon)
                                   );
                $tiles[] = strtoupper($tileName);
            }
        }

        return $tiles;
    }

    // Determina quais tiles são necessários
    $tiles = getSRTMTiles($minLat, $maxLat, $minLon, $maxLon);

    $elevationPoints = []; // Inicializa como array vazio
    $missingTiles = []; // Para armazenar tiles faltando

    foreach ($tiles as $tile) {
        $filePath = __DIR__ . "/SRTM3/" . $tile;
        if (!file_exists($filePath)) {
            writeLog("Arquivo não encontrado: $filePath");
            $missingTiles[] = $tile;
            continue;
        }

        $fileSize = filesize($filePath);
        $size = sqrt($fileSize / 2); // Cada ponto de dados tem 2 bytes

        $handle = fopen($filePath, "rb");
        if ($handle === false) {
            writeLog("Falha ao abrir o arquivo: $filePath");
            continue;
        }

        $delta = 1 / ($size - 1);

        $tileLat = intval(substr($tile, 1, 2)) * (($tile[0] == 'N') ? 1 : -1);
        $tileLon = intval(substr($tile, 4, 3)) * (($tile[3] == 'E') ? 1 : -1);

        // Redução da resolução (pulando pontos)
        $skipFactor = 5; // Pula N-1 pontos para cada ponto lido (ajuste conforme necessário)

        for ($row = 0; $row < $size; $row += $skipFactor) {
            $lat = $tileLat + (1 - $row * $delta);

            if ($lat < $minLat || $lat > $maxLat) {
                fseek($handle, 2 * $size * $skipFactor, SEEK_CUR); // Pula as linhas
                continue;
            }

            fseek($handle, 2 * $row * $size, SEEK_SET); // Vai para o início da linha atual

            for ($col = 0; $col < $size; $col += $skipFactor) {
                $lon = $tileLon + ($col * $delta);

                if ($lon < $minLon || $lon > $maxLon) {
                    fseek($handle, 2 * $skipFactor, SEEK_CUR); // Pula este ponto
                    continue;
                }

                fseek($handle, 2 * ($row * $size + $col), SEEK_SET); // Vai para o ponto específico

                $data = fread($handle, 2);
                if (strlen($data) < 2) {
                    continue;
                }
                $elevation = unpack("n", $data)[1];
                if ($elevation >= 32768) {
                    $elevation -= 65536;
                }

                $elevationPoints[] = [
                    'lat' => $lat,
                    'lon' => $lon,
                    'elevation' => $elevation
                ];
            }
        }

        fclose($handle);
    }

    if (!empty($missingTiles)) {
        // Retorna um erro com os tiles faltando
        http_response_code(400);
        echo json_encode(['error' => 'Arquivos de elevação faltando', 'missingTiles' => $missingTiles]);
        exit;
    }

    // Retorna os pontos de elevação ao cliente
    echo json_encode($elevationPoints);
} catch (Exception $e) {
    writeLog("Exceção capturada: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Erro no servidor', 'message' => $e->getMessage()]);
    exit;
}
?>
