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

cd /immersity/portal/backend/db/scripts
if mariadb -e "USE \`$MYSQL_DATABASE\`" 2>/dev/null; then
    echo "Database $MYSQL_DATABASE already exists. Skipping initialization to avoid seeding duplicate data."
else
    if [ -z "${ADMIN_EMAIL}" ] || [ -z "${ADMIN_PASSWORD}" ]; then
        echo "ADMIN_EMAIL and ADMIN_PASSWORD must be set to initialize the database." >&2
        echo "They create the initial admin account (there is no default password)." >&2
        exit 2
    fi

    mariadb-admin --verbose create "$MYSQL_DATABASE"
    mariadb --database="$MYSQL_DATABASE" < 01_CreateInitialTables.sql
    mariadb --database="$MYSQL_DATABASE" < 02_InsertInitialData.sql
    mariadb --database="$MYSQL_DATABASE" < 03_InsertDummyAssets.sql

    # Create the initial admin account. Escape single quotes for SQL.
    admin_email_sql=$(printf %s "$ADMIN_EMAIL" | sed "s/'/''/g")
    admin_password_sql=$(printf %s "$ADMIN_PASSWORD" | sed "s/'/''/g")
    echo "INSERT INTO KP_User (email, password, role_id, first_name, last_name) \
          VALUES ('$admin_email_sql', SHA('$admin_password_sql'), 1, 'Admin', 'ImmersityXR');" \
        | mariadb --database="$MYSQL_DATABASE"
    echo "Created initial admin account for $ADMIN_EMAIL."
fi
echo "CREATE USER IF NOT EXISTS $MYSQL_USER@localhost IDENTIFIED BY '$MYSQL_PASSWORD';" | mariadb
echo "GRANT ALL PRIVILEGES ON $MYSQL_DATABASE.* TO $MYSQL_USER@localhost;" | mariadb

cd /immersity/portal/backend
node index.js