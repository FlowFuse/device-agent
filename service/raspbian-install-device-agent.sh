#!/bin/bash

if [[ $EUID -ne 0 ]]; then
    echo "This script must be run as root"
    exit 1
fi

# Node.js version
MIN_NODEJS=14

# Update package list and upgrade installed packages
sudo apt-get update

# Helper functions to test for existence of npm
function HAS_NPM {
    if [ -x "$(command -v npm)" ]; then return 0; else return 1; fi
}
# Install Node.js and npm if they do not exist
if [ -x "$(command -v node)" ]; then
    echo "NodeJS found"
    VERSION=$(node --version | cut -d "." -f1 | cut -d "v" -f2)

    if [[ $VERSION -ge $MIN_NODEJS ]]; then
        echo "**************************************************************"
        echo " NodeJS Version $MIN_NODEJS or newer found "
        echo "**************************************************************"
    else
        echo "**************************************************************"
        echo " You need NodeJS $MIN_NODEJS or newer, please upgrade "
        echo "**************************************************************"
        exit 1
    fi
else
    echo "**************************************************************"
    echo " No NodeJS found"
    echo " Do you want to install NodeJS 18?"
    echo "**************************************************************"
    read -p "y/N: " yn
    [ -z "$yn" ] && yn="n"

    if [[ "$yn" == "y" ]] || [[ "$yn" == "Y" ]]; then
        if [ ! -x "$(command -v curl)" ]; then
            sudo apt-get install -y curl
        fi
        sudo apt-get install -y ca-certificates curl gnupg
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
        sudo apt-get update
        sudo apt-get install nodejs -y
    else
        echo "**************************************************************"
        echo " You will need to manually install NodeJS first. "
        echo " Exiting."
        echo "**************************************************************"
        exit 1
    fi
fi

if ! HAS_NPM; then
    # User confirmation for installation
    read -p "Do you wish to proceed with the installation of npm? (y/n): " proceed
    if [[ $proceed != "y" && $proceed != "Y" ]]; then
        echo "Installation cancelled."
        exit 1
    fi
    echo "Installing npm..."
    sudo apt-get install -y npm
fi

# Install Device Agent
sudo npm install -g @flowforge/flowforge-device-agent

# Create the working directory for the Device Agent
sudo mkdir -p /opt/flowforge-device
sudo chown -R $SUDO_USER /opt/flowforge-device

# Create systemd service file for Device Agent
echo "[Unit]
Description=FlowForge Device Agent
Wants=network.target
Documentation=https://flowforge.com/docs

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=/opt/flowforge-device

Environment="NODE_OPTIONS=--max_old_space_size=512"
ExecStart=/usr/bin/env flowforge-device-agent
# Use SIGINT to stop
KillSignal=SIGINT
# Auto restart on crash
Restart=on-failure
RestartSec=20
# Tag things in the log
SyslogIdentifier=FlowForgeDevice
#StandardOutput=syslog

[Install]
WantedBy=multi-user.target" | sudo tee /etc/systemd/system/flowforge-device-agent.service >/dev/null

# Reload systemd, enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable flowforge-device-agent.service
sudo systemctl start flowforge-device-agent.service

# Output status of the service
sudo systemctl status flowforge-device-agent.service
