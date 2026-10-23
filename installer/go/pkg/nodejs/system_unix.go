//go:build linux || darwin

package nodejs

import "runtime"

// systemNodeCandidates returns the fixed locations a system-wide Node.js is
// accepted from, for the current operating system.
//
// Returns:
//   - []string: The absolute candidate paths, empty on an unsupported system
//
func systemNodeCandidates() []string {
	switch runtime.GOOS {
	case "linux":
		return []string{"/usr/bin/node", "/usr/local/bin/node"}
	case "darwin":
		return []string{"/usr/local/bin/node", "/opt/homebrew/bin/node"}
	}
	return nil
}
