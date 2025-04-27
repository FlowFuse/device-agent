package service

// Templates for service configuration files

// SystemdServiceTemplate is the template for the systemd service definition
const SystemdServiceTemplate = `[Unit]
Description=FlowFuse Device Agent
Wants=network.target
Documentation=https://flowfuse.com/docs

[Service]
Type=simple
User={{.User}}
WorkingDirectory={{.WorkDir}}

Environment="NODE_OPTIONS=--max_old_space_size=512"
Environment="PATH={{.NodeBinDir}}:$PATH"
ExecStart=/usr/bin/env -S flowfuse-device-agent
# Use SIGINT to stop
KillSignal=SIGINT
# Auto restart on crash
Restart=on-failure
RestartSec=20
# Tag things in the log
SyslogIdentifier=FlowFuseDevice

[Install]
WantedBy=multi-user.target`
