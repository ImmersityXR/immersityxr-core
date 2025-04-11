#!/bin/sh

openrc default
rc-status

/etc/init.d/mariadb setup
/usr/bin/mariadbd-safe --datadir='/home/mysql'

# rc-service mariadb start
# rc-update add mariadb default

cd /komodo/portal/backend/db/scripts
mariadb-admin --verbose create $MYSQL_DATABASE
mariadb --database=$MYSQL_DATABASE < 01_CreateInitialTables.sql
mariadb --database=$MYSQL_DATABASE < 02_InsertInitialData.sql
mariadb --database=$MYSQL_DATABASE < 03_InsertDummyAssets.sql

rc-service sshd start
rc-update add sshd

cd /komodo/portal/backend
node index.js