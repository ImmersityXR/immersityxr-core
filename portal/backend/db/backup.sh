source ./.env
docker exec komodo-db bash -c "mysqldump -uroot -p$MYSQL_ROOT_PASSWORD $MYSQL_DATABASE > /home/$MYSQL_DATABASE-backup.sql"
