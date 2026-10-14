<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

(static function (): void {
    $infrastructurePath = __DIR__ . '/src/Infrastructure';

    require_once $infrastructurePath . '/Database/ConnectionFactory.php';
})();