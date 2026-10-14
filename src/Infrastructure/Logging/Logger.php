<?php
declare(strict_types=1);

namespace PlanMilT\Infrastructure\Logging;

final class Logger
{
    public static function write(string $message): void
    {
        $logDirectory = getenv('PLANMILT_LOG_DIR') ?: sys_get_temp_dir() . '/planmilt/logs';

        if (!is_dir($logDirectory) && !mkdir($logDirectory, 0770, true) && !is_dir($logDirectory)) {
            error_log($message);
            return;
        }

        $logPath = rtrim($logDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'application.log';
        $logLine = date('Y-m-d H:i:s') . ' - ' . $message . PHP_EOL;

        if (file_put_contents($logPath, $logLine, FILE_APPEND | LOCK_EX) === false) {
            error_log($message);
        }
    }
}