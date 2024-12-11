<?php
// proxy.php

if (!isset($_GET['url'])) {
    header('HTTP/1.1 400 Bad Request');
    echo 'Parâmetro "url" é obrigatório.';
    exit;
}

$url = $_GET['url'];

// Conexão com o banco de dados SQLite
try {
    $db = new PDO('sqlite:bd.db');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Consulta todas as URLs da coluna URL da tabela sigs
    $stmt = $db->query('SELECT URL FROM sigs');
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Extrai os hosts das URLs e os adiciona ao array $allowed_hosts
    $allowed_hosts = [];
    foreach ($results as $row) {
        $sig_url = $row['URL'];
        $parsed_url = parse_url($sig_url);
        if (isset($parsed_url['host'])) {
            $allowed_hosts[] = $parsed_url['host'];
        }
    }

    // Remove duplicatas, se houver
    $allowed_hosts = array_unique($allowed_hosts);

} catch (PDOException $e) {
    // Em caso de erro ao conectar ao banco de dados
    header('HTTP/1.1 500 Internal Server Error');
    echo 'Erro ao conectar ao banco de dados.';
    exit;
}

// Validação do host da URL solicitada
$parsed_url = parse_url($url);
if (!isset($parsed_url['host']) || !in_array($parsed_url['host'], $allowed_hosts)) {
    header('HTTP/1.1 403 Forbidden');
    echo 'Acesso a este host não é permitido.';
    exit;
}

// Reconstrói a URL com os parâmetros de consulta originais, exceto o 'url'
$queryParams = $_GET;
unset($queryParams['url']);
$queryString = http_build_query($queryParams);

// Se houver parâmetros de consulta, adiciona-os à URL
if ($queryString) {
    $url .= (strpos($url, '?') === false ? '?' : '&') . $queryString;
}

// Inicializa cURL
$ch = curl_init();

// Configurações do cURL
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, false);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // Seguir redirecionamentos, se houver

// Executa a requisição
$response = curl_exec($ch);

if ($response === false) {
    header('HTTP/1.1 500 Internal Server Error');
    echo 'Erro ao acessar o servidor remoto.';
    exit;
}

// Obtém o tipo de conteúdo retornado pelo servidor remoto
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

// Fecha a sessão cURL
curl_close($ch);

// Define o tipo de conteúdo retornado
if ($contentType) {
    header('Content-Type: ' . $contentType);
} else {
    header('Content-Type: application/octet-stream');
}

// Retorna a resposta para o cliente
echo $response;
?>