//go:build linux

package style

import "golang.org/x/sys/unix"

// flushTerminalInput discards any unread input queued on the terminal.
func flushTerminalInput(fd uintptr) {
	_ = unix.IoctlSetInt(int(fd), unix.TCFLSH, unix.TCIFLUSH)
}
