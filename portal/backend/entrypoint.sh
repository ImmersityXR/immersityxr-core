#!/bin/sh

script_name="setenv"
if [ -f "$script_name.sh" ]; then
    echo "Running $script_name.sh"
    . ./$script_name.sh
else
    echo "Note: $script_name.sh not detected. Skipping the file."
    echo "  If you intended to run this script, copy $script_name.template.sh to a new file $script_name.sh and set your environment variables there."
fi

echo "Checking that environment variables were set correctly."

is_env_valid=1

if [ -z "${MYSQL_DATABASE}" ]; then
    echo "  \$MYSQL_DATABASE must not be empty." >&2
    is_env_valid=0
fi

if [ -z "${MYSQL_USER}" ]; then
    echo "  \$MYSQL_USER must not be empty." >&2
    is_env_valid=0
fi

if [ -z "${MYSQL_PASSWORD}" ]; then
    echo "  \$MYSQL_PASSWORD must not be empty." >&2
    is_env_valid=0
fi

if [ $is_env_valid -eq 0 ]; then
    exit 2
fi

openrc default
rc-status

/etc/init.d/mariadb setup
/usr/bin/mariadbd-safe --datadir='/home/mysql' --nowatch --socket='/run/mysqld/mysqld.sock'

sleep 10

cd /komodo/portal/backend/db/scripts
mariadb-admin --verbose create $MYSQL_DATABASE
echo "CREATE USER IF NOT EXISTS $MYSQL_USER@localhost IDENTIFIED BY '$MYSQL_PASSWORD';" | mariadb
echo "GRANT ALL PRIVILEGES ON $MYSQL_DATABASE.* TO $MYSQL_USER@localhost;" | mariadb
mariadb --database=$MYSQL_DATABASE < 01_CreateInitialTables.sql
mariadb --database=$MYSQL_DATABASE < 02_InsertInitialData.sql
mariadb --database=$MYSQL_DATABASE < 03_InsertDummyAssets.sql

rc-service sshd start
rc-update add sshd

cd /komodo/portal/backend
node index.js