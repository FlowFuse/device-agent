// Package style provides chalk-like terminal text styling that degrades
// gracefully. When stdout is not an interactive terminal (e.g. piped or
// redirected to a file), or when NO_COLOR / TERM=dumb are set, the helpers
// return their input unchanged so no escape sequences are emitted.
//
// Styling is intended for console output only. The logger package strips ANSI
// escape sequences before writing to its log file, so it is safe to wrap
// substrings passed to logger.Info/Debug/Error.
package style

import (
	"fmt"
	"os"
	"sync/atomic"
)

// promptSaved tracks whether a cursor position has been saved (via SaveCursor)
// but not yet restored. A signal handler uses this to leave the terminal clean
// if the user interrupts (Ctrl-C) while a prompt is on screen.
var promptSaved atomic.Bool

var (
	// stdoutIsTerminal reports whether stdout is an interactive terminal.
	stdoutIsTerminal = detectTerminal()

	// termIsDumb is true for terminals that don't understand ANSI sequences.
	termIsDumb = os.Getenv("TERM") == "dumb"

	// Enabled reports whether ANSI colour styling will be emitted. It is computed
	// once from stdout and the environment (respects NO_COLOR and TERM=dumb).
	Enabled = stdoutIsTerminal && !termIsDumb && os.Getenv("NO_COLOR") == ""

	// controlEnabled reports whether cursor-control sequences may be emitted.
	// Unlike colour, this is not disabled by NO_COLOR (which concerns colour only).
	controlEnabled = stdoutIsTerminal && !termIsDumb
)

func detectTerminal() bool {
	fi, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	// A character device is our proxy for "attached to a terminal".
	return fi.Mode()&os.ModeCharDevice != 0
}

// SaveCursor records the current cursor position (DEC save-cursor) so a later
// RestoreAndClear can return to it. It is a no-op when stdout is not a
// control-capable terminal (piped/redirected or TERM=dumb), so it may be called
// unconditionally.
func SaveCursor() {
	if !controlEnabled {
		return
	}
	promptSaved.Store(true)
	fmt.Fprint(os.Stdout, "\x1b7") // DECSC
}

// RestoreAndClear returns the cursor to the position recorded by the most recent
// SaveCursor and erases everything printed since (from the cursor to the end of
// the screen). It is a no-op when stdout is not a control-capable terminal.
//
// Typical use: SaveCursor before printing a prompt, then RestoreAndClear once
// the response has been read, to collapse the prompt out of the scrollback.
// Unlike counting lines, this is unaffected by how the prompt wraps. Note it
// relies on a single saved position, so it must not be nested, and a very long
// prompt that scrolls the screen between save and restore may misalign.
func RestoreAndClear() {
	if !controlEnabled {
		return
	}
	promptSaved.Store(false)
	fmt.Fprint(os.Stdout, "\x1b8\x1b[0J") // DECRC + ED(0): erase to end of screen
}

// CancelPrompt leaves the terminal in a clean state after an interruption (e.g.
// Ctrl-C) while a prompt is on screen. If a cursor position was saved but not
// yet restored, it pairs that save with a restore + erase so no dangling
// save-cursor state is left behind (which would otherwise corrupt cursor
// handling until the terminal is reset). It always re-shows the cursor and
// resets text attributes. Safe to call from a signal handler and when no prompt
// is active; it is a no-op on non-control terminals.
func CancelPrompt() {
	if !controlEnabled {
		return
	}
	if promptSaved.Swap(false) {
		fmt.Fprint(os.Stdout, "\x1b8\x1b[0J") // restore to prompt start and erase it
	}
	fmt.Fprint(os.Stdout, "\x1b[?25h\x1b[0m") // show cursor, reset attributes
}

// wrap applies the given SGR parameter(s) to s when styling is enabled.
func wrap(codes, s string) string {
	if !Enabled {
		return s
	}
	return "\x1b[" + codes + "m" + s + "\x1b[0m"
}

// Bold renders s in bold. Mirrors chalk.bold.
func Bold(s string) string { return wrap("1", s) }

// Dim renders s dimmed. Mirrors chalk.dim.
func Dim(s string) string { return wrap("2", s) }

// Cyan renders s in cyan. Mirrors chalk.cyan.
func Cyan(s string) string { return wrap("36", s) }

// Green renders s in green. Mirrors chalk.green.
func Green(s string) string { return wrap("32", s) }

// Yellow renders s in yellow. Mirrors chalk.yellow.
func Yellow(s string) string { return wrap("33", s) }

// Red renders s in red. Mirrors chalk.red.
func Red(s string) string { return wrap("31", s) }
