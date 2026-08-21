//go:build darwin

package style

import "golang.org/x/sys/unix"

// flushTerminalInput discards any unread input queued on the terminal.
func flushTerminalInput(fd uintptr) {
	_ = unix.IoctlSetPointerInt(int(fd), unix.TIOCFLUSH, unix.TCIFLUSH)
}
