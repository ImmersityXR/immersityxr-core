#!/bin/sh

if [ "$#" -ne 2 ]; then
    echo "Usage: ./upload-build.sh <directory> <host>" >&2
    exit 2
fi

host=$2

cd $1
cur_dir=$(basename $PWD)
cd ..

# to verify which directories are being uploaded, uncomment this line:
# find v0.5.7 -type d -exec echo "{}/" \;

# the trailing slash is necessary for creating directories
# find $cur_dir -type d -exec curl --ftp-create-dirs -T {} "$host/{}/" \;
for dir in $(find $cur_dir -type d)
do
    curl --ftp-create-dirs -T $dir $host/$dir/;
done

# to verify which files are being uploaded, uncomment this line:
# find v0.5.7 -type f
# find $cur_dir -type f -exec curl -T {} "$host/{}" \;
for file in $(find $cur_dir -type f)
do
    curl -T $file $host/$file;
done