-- =============================================================
--  Docker only: database init script (part 2)
--
--  docker-compose.yml mounts this file AND database/schema.sql into
--  /docker-entrypoint-initdb.d/ of the MySQL container. The entrypoint runs
--  every .sql file there, alphabetically, as root: 10-schema.sql creates the
--  tables and the 'shop'@'localhost' / 'shop'@'127.0.0.1' accounts, then this
--  file (20-) adds one more account.
--
--  WHY AN EXTRA ACCOUNT?
--  The PHP container connects to the MySQL container over the Docker network,
--  so MySQL sees the connection arriving from the container's IP address --
--  never from "localhost" nor from "127.0.0.1" of its own machine. Neither of
--  the two accounts created in schema.sql would match. 'shop'@'%' accepts any
--  host, which is acceptable inside a private Docker network and is the only
--  way for the web container to log in.
--
--  This file deliberately does NOT re-create the tables or the database:
--  that is schema.sql's job, and keeping one canonical schema file means the
--  Docker setup and a manual import never drift apart.
-- =============================================================

CREATE USER IF NOT EXISTS 'shop'@'%' IDENTIFIED BY 'shop_local';
GRANT SELECT, INSERT, UPDATE, DELETE ON shop.* TO 'shop'@'%';
FLUSH PRIVILEGES;