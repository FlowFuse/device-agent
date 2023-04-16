#!/bin/sh
config_file="device.yml"

# Get the paths to the read-only and writable directories
snap_user_data="$SNAP_USER_DATA/flowforge-device"
read_only_config="$SNAP/config/$config_file"
writable_config="$snap_user_data/$config_file"

# Ensure the writable directory exists
mkdir -p "$snap_user_data"

# Check if the writable configuration file exists
if [ ! -f "$writable_config" ]; then
    # If not, copy the read-only configuration file to the writable directory
    cp "$read_only_config" "$writable_config"
fi

# Define default values for optional arguments
interval="60"
port="1881"

# Parse optional arguments
while getopts "i:p:m:" opt; do
  case $opt in
    i) interval="$OPTARG";;
    p) port="$OPTARG";;
    *) echo "Usage: $0 [-i interval] [-p port]"; exit 1;;
  esac
done

"$SNAP"/bin/node "$SNAP"/lib/node_modules/.bin/flowforge-device-agent -d "$snap_user_data" -c "$writable_config" -i "$interval" -p "$port"