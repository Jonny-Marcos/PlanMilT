<?php
declare(strict_types=1);

/**
 * Repassa imagens WMS de origens cadastradas para a captura local do visualizador 3D.
 */
require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Infrastructure/Http/MapImageProxy.php';

use PlanMilT\Infrastructure\Http\MapImageProxy;
use PlanMilT\Infrastructure\Database\ConnectionFactory;

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    exit;
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$expectedOrigin = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://')
    . ($_SERVER['HTTP_HOST'] ?? '');
if ($origin === '' || !hash_equals($expectedOrigin, $origin)
    || (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] !== 'same-origin')) {
    http_response_code(403);
    exit;
}

session_name('PlanMilTMap3D');
session_set_cookie_params([
    'httponly' => true,
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Strict',
    'path' => '/',
]);
session_start();
$now = time();
$rateLimit = $_SESSION['map_image_proxy_rate'] ?? ['startedAt' => $now, 'count' => 0];
if ($now - (int) $rateLimit['startedAt'] >= 60) {
    $rateLimit = ['startedAt' => $now, 'count' => 0];
}
if ((int) $rateLimit['count'] >= 240) {
    session_write_close();
    http_response_code(429);
    exit;
}
$rateLimit['count']++;
$_SESSION['map_image_proxy_rate'] = $rateLimit;
session_write_close();

$rawData = file_get_contents('php://input');
if ($rawData === false || strlen($rawData) > 10000) {
    http_response_code(413);
    exit;
}
$request = json_decode($rawData, true);
if (!is_array($request) || !is_string($request['url'] ?? null)) {
    http_response_code(400);
    exit;
}

try {
    $image = (new MapImageProxy(ConnectionFactory::create()))->fetch($request['url']);
    header('Content-Type: ' . $image['contentType']);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo $image['body'];
} catch (InvalidArgumentException $error) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'A camada não pode ser encaminhada pelo visualizador 3D.']);
} catch (RuntimeException $error) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Não foi possível carregar uma imagem de camada para o visualizador 3D.']);
}
