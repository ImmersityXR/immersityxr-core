# Synchronizes session files between relay and data servers:
# we can run this script without a password because we have generated a private/public keypair to the komodo-ml VM
# we authenticate first using the key and then rysync command is executed
rsync -avz --exclude='.mic' ./captures/ graingeridealab@13.67.142.168:/home/graingeridealab/komodo_data/captures/
