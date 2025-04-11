# Immersity DB
Docker and initialization scripts for the Immersity MySQL database, supporting the platform portal, relay server, and data pipeline. 

Copy `.env.template` to a new file and name it .env`, and fill out the values.

Verifying startup:
`brew install mysql`
`mysql -h 127.0.0.1 -P 3306 -u admin -p immersity-db`
The values 3306, admin, and immersity-xr correspond to the MYSQL_PORT, MYSQL_USER, and MYSQL_DATABASE values respectively. 

