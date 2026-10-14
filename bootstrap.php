<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    http_response_code(404);
    exit;
}

(static function (): void {
    $applicationRoot = getenv('PLANMILT_APP_ROOT') ?: __DIR__;
    $infrastructurePath = $applicationRoot . '/src/Infrastructure';

    require_once $infrastructurePath . '/Database/ConnectionFactory.php';
    require_once $infrastructurePath . '/Logging/Logger.php';
})();