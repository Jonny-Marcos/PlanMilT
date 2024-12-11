<?php
// Diretórios para procurar arquivos SVG
$directories = array(
    $_SERVER['DOCUMENT_ROOT'] . '/symbols/c2',
    $_SERVER['DOCUMENT_ROOT'] . '/symbols/enemy',
    $_SERVER['DOCUMENT_ROOT'] . '/symbols/friend'
);

$icons = array(); // Inicializa o array para coletar os ícones

foreach ($directories as $directoryPath) {
    if (is_dir($directoryPath)) {
        // Filtra arquivos para incluir apenas .svg
        $files = array_filter(scandir($directoryPath), function($item) use ($directoryPath) {
            return is_file($directoryPath . '/' . $item) && strtolower(pathinfo($item, PATHINFO_EXTENSION)) == 'svg';
        });

        foreach ($files as $file) {
            // Adiciona o caminho do arquivo relativo ao diretório raiz do servidor
            $relativePath = str_replace($_SERVER['DOCUMENT_ROOT'], '', $directoryPath) . '/' . $file;
            $icons[] = $relativePath;
        }
    }
}

echo json_encode($icons);
?>