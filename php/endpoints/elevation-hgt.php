<?php
declare(strict_types=1);

/**
 * Fornece ao navegador um HGT local válido para análises offline.
 */
require_once dirname(__DIR__) . '/bootstrap.php';

ini_set('display_errors', '0');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

/**
 * Retorna uma falha JSON sem revelar caminhos internos.
 * @param int $status Código HTTP da falha.
 * @param string $message Mensagem destinada ao usuário.
 * @return never
 */
function sendHgtError(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message]);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    sendHgtError(405, 'Use POST para consultar o arquivo de elevação.');
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$expectedOrigin = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://')
    . ($_SERVER['HTTP_HOST'] ?? '');
if ($origin === '' || !hash_equals($expectedOrigin, $origin)
    || (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] !== 'same-origin')) {
    sendHgtError(403, 'A consulta de elevação deve vir do aplicativo.');
}
$contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '', 2)[0]));
if ($contentType !== 'application/json') {
    sendHgtError(415, 'A requisição deve usar application/json.');
}
$raw = file_get_contents('php://input', false, null, 0, 1025);
$data = $raw !== false && strlen($raw) <= 1024 ? json_decode($raw, true) : null;
$tile = is_array($data) ? ($data['tile'] ?? null) : null;
if (!is_string($tile) || !preg_match('/^([NS])(\d{2})([EW])(\d{3})\.HGT$/D', $tile, $parts)) {
    sendHgtError(400, 'Informe um tile HGT válido.');
}
$latitude = (int) $parts[2];
$longitude = (int) $parts[4];
if (($parts[1] === 'N' ? $latitude >= 90 : $latitude < 1 || $latitude > 90)
    || ($parts[3] === 'E' ? $longitude >= 180 : $longitude < 1 || $longitude > 180)) {
    sendHgtError(400, 'Informe um tile HGT válido.');
}
$path = dirname(__DIR__, 2) . '/SRTM3/' . $tile;
if (is_link($path) || !is_file($path)) {
    sendHgtError(404, 'Arquivo de elevação não disponível.');
}
$handle = @fopen($path, 'rb');
if ($handle === false) {
    sendHgtError(500, 'Não foi possível ler o arquivo de elevação.');
}
$stat = fstat($handle);
$size = $stat['size'] ?? 0;
if (!in_array($size, [1201 * 1201 * 2, 3601 * 3601 * 2], true)) {
    fclose($handle);
    sendHgtError(422, 'O arquivo de elevação possui formato inválido.');
}
header('Content-Type: application/octet-stream');
header('Content-Length: ' . $size);
fpassthru($handle);
fclose($handle);