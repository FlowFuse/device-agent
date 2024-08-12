#!/bin/bash

echo "**************************************************************"
echo " FlowFuse Device Agent Installer                            "
echo "                                                            "
echo " Warning: "
echo " The install need root privileges at times, it uses         "   
echo " sudo so may ask for your password.                         "
echo " Root access is used to install Node.js if needed, to set   "
echo " directory permissions, to install the FlowFuse Device      "         
echo " Agent and register the Device Agent as service             "                                           
echo "                                                            "
echo "**************************************************************"

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
sudo npm install -g @flowfuse/device-agent

# Create the working directory for the Device Agent
sudo mkdir -p /opt/flowfuse-device
sudo chown -R $USER /opt/flowfuse-device

# Create systemd service file for Device Agent
echo "[Unit]
Description=FlowFuse Device Agent
Wants=network.target
Documentation=https://flowfuse.com/docs

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/flowfuse-device

Environment="NODE_OPTIONS=--max_old_space_size=512"
ExecStart=/usr/bin/env -S flowfuse-device-agent
# Use SIGINT to stop
KillSignal=SIGINT
# Auto restart on crash
Restart=on-failure
RestartSec=20
# Tag things in the log
SyslogIdentifier=FlowFuseDevice
#StandardOutput=syslog

[Install]
WantedBy=multi-user.target" | sudo tee /etc/systemd/system/flowfuse-device-agent.service >/dev/null

# Reload systemd, enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable flowfuse-device-agent.service
sudo systemctl start flowfuse-device-agent.service

# Output status of the service
sudo systemctl status flowfuse-device-agent.service
