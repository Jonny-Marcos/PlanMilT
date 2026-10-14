<?php
declare(strict_types=1);

namespace PlanMilT\Infrastructure\Database;

use PDO;

final class ConnectionFactory
{
    public static function create(): PDO
    {
        $databasePath = getenv('PLANMILT_DB_PATH') ?: dirname(__DIR__, 3) . '/bd.db';

        return new PDO('sqlite:' . $databasePath, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
}