//go:build !linux && !darwin

package style

// flushTerminalInput is a no-op on platforms without a terminal input queue to
// flush. On Windows the installer never runs a helper that leaves typed input
// unread (elevation is granted before the process starts), so stale input does
// not accumulate ahead of a prompt.
func flushTerminalInput(fd uintptr) {}
