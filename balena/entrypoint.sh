#!/bin/bash

hostname $BALENA_DEVICE_NAME_AT_INIT

if  [ ! -z "$FF_DEVICE_YML" ]; then
  echo "FF_DEVICE_YML env var found"
  echo "$FF_DEVICE_YML"
  cat /opt/flowfuse-device/device.yml
  if [ ! -f /opt/flowfuse-device/device.yml ]; then
    echo "Writing file"
    echo $FF_DEVICE_YML | base64 -d > /opt/flowfuse-device/device.yml
    cat /opt/flowfuse-device/device.yml
  else
    echo "Existing device.yml found"
    cat /opt/flowfuse-device/device.yml
  fi
else
  echo "No device.yml env var provided"
fi

echo $@

exec "$@"
