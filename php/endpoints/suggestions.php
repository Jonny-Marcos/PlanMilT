<?php
declare(strict_types=1);

/** Recebe sugestões e retorna apenas registros autorizados pela chave do navegador. */
require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/SuggestionsService.php';

use PlanMilT\Application\SuggestionsService;
use PlanMilT\Infrastructure\Database\ConnectionFactory;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    echo json_encode(['error' => 'Use POST para acessar sugestões.']);
    exit;
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$expectedOrigin = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https://' : 'http://')
    . ($_SERVER['HTTP_HOST'] ?? '');
if ($origin === '' || !hash_equals($expectedOrigin, $origin)
    || (isset($_SERVER['HTTP_SEC_FETCH_SITE']) && $_SERVER['HTTP_SEC_FETCH_SITE'] !== 'same-origin')) {
    http_response_code(403);
    echo json_encode(['error' => 'A requisição deve vir do aplicativo.']);
    exit;
}
if (!preg_match('/\Aapplication\/json(?:\s*;|$)/i', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))) {
    http_response_code(415);
    echo json_encode(['error' => 'Envie dados JSON.']);
    exit;
}
$length = filter_var($_SERVER['CONTENT_LENGTH'] ?? '0', FILTER_VALIDATE_INT);
if ($length === false || $length < 0 || $length > 65536) {
    http_response_code(413);
    echo json_encode(['error' => 'A sugestão excede o limite permitido.']);
    exit;
}
$raw = file_get_contents('php://input', false, null, 0, 65537);
if ($raw === false || strlen($raw) > 65536) {
    http_response_code(413);
    echo json_encode(['error' => 'A sugestão excede o limite permitido.']);
    exit;
}
$data = json_decode($raw, true);
if (!is_array($data) || !is_string($data['action'] ?? null) || !is_string($data['token'] ?? null)) {
    http_response_code(400);
    echo json_encode(['error' => 'Requisição inválida.']);
    exit;
}
try {
    $service = new SuggestionsService(ConnectionFactory::create());
    switch ($data['action']) {
        case 'list':
            $result = ['suggestions' => $service->list($data['token'])];
            break;
        case 'create':
            if (!is_string($data['requestId'] ?? null) || !is_string($data['title'] ?? null)
                || !is_string($data['description'] ?? null)) {
                throw new InvalidArgumentException('Dados da sugestão inválidos.');
            }
            $result = ['id' => $service->create(
                $data['token'], $data['requestId'], $data['title'], $data['description'],
                (string) ($_SERVER['REMOTE_ADDR'] ?? '')
            )];
            break;
        case 'update':
            if (!is_int($data['id'] ?? null) || !is_string($data['title'] ?? null)
                || !is_string($data['description'] ?? null)) {
                throw new InvalidArgumentException('Dados da sugestão inválidos.');
            }
            $service->update($data['token'], $data['id'], $data['title'], $data['description']);
            $result = ['success' => true];
            break;
        default:
            throw new InvalidArgumentException('Ação inválida.');
    }
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (PDOException $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível acessar as sugestões.'], JSON_UNESCAPED_UNICODE);
} catch (OverflowException $error) {
    http_response_code(429);
    echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (RuntimeException $error) {
    http_response_code(409);
    echo json_encode(['error' => $error->getMessage()], JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível acessar as sugestões.'], JSON_UNESCAPED_UNICODE);
}
