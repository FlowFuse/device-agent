//go:build windows

package style

import (
	"os"

	"golang.org/x/sys/windows"
)

// init enables ANSI escape sequence processing on the Windows console so the
// codes emitted by this package are interpreted rather than printed literally.
// On consoles that don't support it this is a harmless no-op.
func init() {
	handle := windows.Handle(os.Stdout.Fd())
	var mode uint32
	if err := windows.GetConsoleMode(handle, &mode); err != nil {
		return
	}
	_ = windows.SetConsoleMode(handle, mode|windows.ENABLE_VIRTUAL_TERMINAL_PROCESSING)
}
