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

PATH={{.NodeBinDir}}:$PATH
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
