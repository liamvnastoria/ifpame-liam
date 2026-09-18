# =============================================================
#  Octet shop — web container
#
#  A plain PHP + Apache image, with the pdo_mysql driver installed:
#  that driver is what every api/*.php endpoint uses to reach the
#  database (see config/database.php).
#
#  The MySQL database lives in a SEPARATE container (see
#  docker-compose.yml), so this image only needs PHP + Apache.
# =============================================================

# php:8.4-apache ships Apache with mod_php already configured. The school
# project targets PHP 8.1+, and 8.4 matches the check in tools/check-env.php.
FROM php:8.4-apache

# pdo_mysql is NOT included in the official image: each PHP driver is an
# extension that the image builder compiles. docker-php-ext-install is the
# helper provided by the official image for exactly that.
# a2enmod rewrite enables Apache's URL rewriting module (harmless, and some
# hosts need it for clean URLs).
RUN docker-php-ext-install pdo_mysql && a2enmod rewrite

# The whole project becomes Apache's document root. When docker-compose is
# used for development, a bind mount overrides this COPY so changes to the
# code appear without rebuilding the image.
COPY . /var/www/html/

# The image listens on Apache's default port.
EXPOSE 80