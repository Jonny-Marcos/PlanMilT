# Usar imagem base do PHP com Apache
FROM php:7.4-apache

# Instalar extensões necessárias para SQLite
RUN docker-php-ext-install pdo pdo_sqlite

# Copiar os arquivos da aplicação para o diretório padrão do servidor web
COPY . /var/www/html/

# Definir permissões para o banco de dados
RUN chmod -R 777 /var/www/html/bd.db

# Copiar o arquivo de configuração do PHP
COPY php.ini /usr/local/etc/php/

# Expor a porta 80
EXPOSE 80
