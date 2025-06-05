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
Environment="PATH={{.NodeBinDir}}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
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

// SysVInitServiceTemplate is the template for the SysVInit script
const SysVInitServiceTemplate = `#!/bin/sh
### BEGIN INIT INFO
# Provides:          {{.ServiceName}}
# Required-Start:    $network $remote_fs $syslog
# Required-Stop:     $network $remote_fs $syslog
# Default-Start:     2 3 4 5
# Default-Stop:      0 1 6
# Short-Description: FlowFuse Device Agent
# Description:       Runs the FlowFuse Device Agent
### END INIT INFO

# Source function library.
. /lib/lsb/init-functions

PATH={{.NodeBinDir}}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
DAEMON="{{.NodeBinDir}}/flowfuse-device-agent"
DAEMON_ARGS=""
NAME="{{.ServiceName}}"
DESC="FlowFuse Device Agent"
PIDFILE=/var/run/$NAME.pid
LOGFILE=/var/log/$NAME.log
SCRIPTNAME=/etc/init.d/$NAME
USER={{.User}}
WORKING_DIR={{.WorkDir}}

# Exit if the binary is not available
[ -x "$DAEMON" ] || exit 0

do_start() {
    log_daemon_msg "Starting $DESC" "$NAME"
    export NODE_OPTIONS="--max_old_space_size=512"
    start-stop-daemon --start --quiet --background --user $USER --chdir $WORKING_DIR \
        --make-pidfile --pidfile $PIDFILE --startas /bin/bash \
        -- -c "exec $DAEMON $DAEMON_ARGS > $LOGFILE 2>&1"
    log_end_msg $?
}

do_stop() {
    log_daemon_msg "Stopping $DESC" "$NAME"
    start-stop-daemon --stop --quiet --retry=TERM/30/KILL/5 --pidfile $PIDFILE
    log_end_msg $?
    rm -f $PIDFILE
}

do_status() {
    status_of_proc -p $PIDFILE "$DAEMON" "$NAME" && exit 0 || exit $?
}

case "$1" in
    start)
        do_start
        ;;
    stop)
        do_stop
        ;;
    restart)
        do_stop
        do_start
        ;;
    status)
        do_status
        ;;
    *)
        echo "Usage: $SCRIPTNAME {start|stop|restart|status}" >&2
        exit 3
        ;;
esac

exit 0`

// LaunchdTemplate is the template for the launchd property list file
const launchdTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{{.Label}}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{{.NodeBinDir}}/node</string>
        <string>{{.NodeBinDir}}/flowfuse-device-agent</string>
    </array>
    <key>UserName</key>
    <string>{{.User}}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>{{.LogFile}}</string>
    <key>StandardErrorPath</key>
    <string>{{.ErrorFile}}</string>
    <key>WorkingDirectory</key>
    <string>{{.WorkDir}}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_OPTIONS</key>
        <string>--max_old_space_size=512</string>
        <key>PATH</key>
        <string>{{.NodeBinDir}}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>`

const newsyslogTemplate = `
{{.LogFile}} {{.User}}: 640 5 * $D0 J
{{.ErrorFile}} {{.User}}: 640 5 * $D0 J
`

const OpenRCServiceTemplate = `#!/sbin/openrc-run

name="FlowFuse Device Agent"
description="FlowFuse Device Agent"
supervisor="supervise-daemon"
command="{{.NodeBinDir}}/flowfuse-device-agent"
supervise_daemon_args=" -d {{.WorkDir}} --stdout {{.LogFile}} --stderr {{.ErrorLogFile}} -e "PATH=\"{{.NodeBinDir}}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\""
command_user="{{.User}}"

depend() {
    use net logger
}
`