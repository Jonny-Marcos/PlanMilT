<?php
declare(strict_types=1);

namespace PlanMilT\Application;

use RuntimeException;

/**
 * Obtém tiles HGT públicos da Mapzen e os reduz para a grade SRTM3 usada pela aplicação.
 */
final class ElevationDownloadService
{
    private const SIZE = 1201;
    private const SOURCE_SIZE = 3601;
    private const MAX_COMPRESSED_BYTES = 30000000;
    private const MAX_MANAGED_BYTES = 1073741824;

    private string $directory;
    private $download;

    /**
     * @param string $directory Diretório operacional de elevação.
     * @param callable|null $download Transporte opcional para testes.
     */
    public function __construct(string $directory, ?callable $download = null)
    {
        $this->directory = $directory;
        $this->download = $download ?? [$this, 'downloadTile'];
    }

    /**
     * Baixa um tile, preservando arquivos existentes e limitando o espaço usado.
     *
     * @param string $name Nome geográfico HGT.
     * @return string Nome canônico do tile disponível.
     */
    public function ensureTile(string $name): string
    {
        $name = strtoupper($name);
        if (!preg_match('/^([NS])(\d{2})([EW])(\d{3})\.HGT$/D', $name, $parts)) {
            throw new \InvalidArgumentException('Nome de tile HGT inválido.');
        }
        $latitude = (int) $parts[2];
        $longitude = (int) $parts[4];
        if (($parts[1] === 'N' ? $latitude >= 90 : $latitude < 1 || $latitude > 90) ||
            ($parts[3] === 'E' ? $longitude >= 180 : $longitude < 1 || $longitude > 180)) {
            throw new \InvalidArgumentException('Coordenadas do tile HGT inválidas.');
        }
        if (!is_dir($this->directory) || !is_writable($this->directory)) {
            throw new RuntimeException('O diretório de elevação não está disponível para escrita.');
        }
        $target = $this->directory . DIRECTORY_SEPARATOR . $name;
        if (file_exists($target)) return $name;

        $lock = fopen($this->directory . DIRECTORY_SEPARATOR . '.download.lock', 'c');
        if ($lock === false || !flock($lock, LOCK_EX | LOCK_NB)) {
            if ($lock !== false) fclose($lock);
            throw new RuntimeException('Outro download de elevação está em andamento. Tente novamente.');
        }
        $compressed = false;
        $output = false;
        try {
            clearstatcache(true, $target);
            if (file_exists($target)) return $name;
            $total = 0;
            foreach (new \DirectoryIterator($this->directory) as $entry) {
                if ($entry->isFile() && preg_match('/\.hgt$/iD', $entry->getFilename())) {
                    $total += $entry->getSize();
                }
            }
            if ($total + self::SIZE * self::SIZE * 2 > self::MAX_MANAGED_BYTES) {
                throw new RuntimeException('Limite de armazenamento de elevação atingido.');
            }
            $compressed = tempnam($this->directory, '.elevation-gz-');
            $output = tempnam($this->directory, '.elevation-hgt-');
            if ($compressed === false || $output === false) {
                throw new RuntimeException('Não foi possível preparar o arquivo de elevação.');
            }
            ($this->download)($name, $compressed);
            $this->convertTile($compressed, $output);
            if (!link($output, $target) && !is_file($target)) {
                throw new RuntimeException('Não foi possível guardar o tile de elevação.');
            }
            return $name;
        } finally {
            if ($compressed !== false && is_file($compressed)) unlink($compressed);
            if ($output !== false && is_file($output)) unlink($output);
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    /**
     * Descarrega um único arquivo com destino fixo, tempo e tamanho limitados.
     * @param string $name Nome HGT validado.
     * @param string $path Arquivo temporário de destino.
     */
    private function downloadTile(string $name, string $path): void
    {
        if (!function_exists('curl_init')) throw new RuntimeException('A extensão cURL do PHP é necessária.');
        $url = 'https://s3.amazonaws.com/elevation-tiles-prod/skadi/' . substr($name, 0, 3) . '/' . substr($name, 0, -4) . '.hgt.gz';
        $file = fopen($path, 'wb');
        if ($file === false) throw new RuntimeException('Não foi possível preparar o download.');
        $curl = curl_init($url);
        if ($curl === false) {
            fclose($file);
            throw new RuntimeException('Não foi possível iniciar o download.');
        }
        $bytes = 0;
        try {
            curl_setopt_array($curl, [
                CURLOPT_FOLLOWLOCATION => false,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT => 90,
                CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
                CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use ($file, &$bytes): int {
                    $bytes += strlen($chunk);
                    if ($bytes > self::MAX_COMPRESSED_BYTES) return 0;
                    $written = fwrite($file, $chunk);
                    return $written === false ? 0 : $written;
                },
            ]);
            $success = curl_exec($curl);
            $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            if ($success === false || $status !== 200 || $bytes === 0) {
                throw new RuntimeException('Não foi possível baixar o tile da fonte de elevação.');
            }
        } finally {
            curl_close($curl);
            fclose($file);
        }
    }

    /**
     * Converte a grade 3601 × 3601 em 1201 × 1201 por subamostragem.
     * @param string $compressed Caminho gzip.
     * @param string $output Caminho temporário de saída.
     */
    private function convertTile(string $compressed, string $output): void
    {
        $source = gzopen($compressed, 'rb');
        $destination = fopen($output, 'wb');
        if ($source === false || $destination === false) {
            if ($source !== false) gzclose($source);
            if ($destination !== false) fclose($destination);
            throw new RuntimeException('Não foi possível abrir o arquivo de elevação.');
        }
        try {
            $rowBytes = self::SOURCE_SIZE * 2;
            for ($row = 0; $row < self::SOURCE_SIZE; $row++) {
                $data = '';
                while (strlen($data) < $rowBytes && !gzeof($source)) {
                    $part = gzread($source, $rowBytes - strlen($data));
                    if ($part === false || $part === '') break;
                    $data .= $part;
                }
                if (strlen($data) !== $rowBytes) throw new RuntimeException('Tile de elevação incompleto ou inválido.');
                if ($row % 3 !== 0) continue;
                $reduced = '';
                for ($column = 0; $column < self::SOURCE_SIZE; $column += 3) {
                    $reduced .= substr($data, $column * 2, 2);
                }
                if (fwrite($destination, $reduced) !== strlen($reduced)) {
                    throw new RuntimeException('Falha ao gravar o tile de elevação.');
                }
            }
            if (gzread($source, 1) !== '') throw new RuntimeException('Tile de elevação tem tamanho inválido.');
        } finally {
            gzclose($source);
            fclose($destination);
        }
    }
}
