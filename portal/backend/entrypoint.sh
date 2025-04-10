#!/bin/sh

mkdir /home

openrc default
rc-status

chown mysql /home/mysql
/etc/init.d/mariadb setup
cd '/usr'
/usr/bin/mariadbd-safe --datadir='/home/mysql'
rc-service mariadb start
rc-update add mariadb default

rc-service sshd start
rc-update add sshd

node index.js