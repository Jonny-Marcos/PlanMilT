# Usar uma imagem base oficial do PHP com Apache
FROM php:7.4-apache

# Instalar extensões PHP necessárias
RUN apt-get update && apt-get install -y \
    libsqlite3-dev \
    unzip \
    && docker-php-ext-install pdo pdo_sqlite

# Configurar o ServerName no Apache
RUN echo "ServerName PlanMilT" >> /etc/apache2/apache2.conf

# Copiar os arquivos da aplicação para o diretório padrão do servidor web
COPY . /var/www/html/

# Configurar permissões de leitura e escrita para o banco de dados
RUN chown -R www-data:www-data /var/www/html && \
    chmod -R 775 /var/www/html && \
    chmod 664 /var/www/html/bd.db

# Copiar o arquivo de configuração do PHP
COPY php.ini /usr/local/etc/php/

# Configurar o diretório de trabalho
WORKDIR /var/www/html

# Expor a porta padrão do servidor Apache
EXPOSE 80

# Iniciar o Apache no modo foreground
CMD ["apache2-foreground"]
