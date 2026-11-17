//go:build windows

package nodejs

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/flowfuse/device-agent-installer/pkg/logger"

	"golang.org/x/sys/windows/registry"
)

// nodeRegistryValueNames lists the value names under SOFTWARE\Node.js that may
// hold the Node.js installation directory or executable path.
var nodeRegistryValueNames = []string{"InstallPath", "InstallDir", "Path"}

// normaliseRegistryNodePath turns a registry value describing a Node.js
// installation into a candidate node.exe path. Surrounding whitespace and
// quotes are trimmed; a directory is completed with node.exe, a value that
// already names an executable is kept as-is.
//
// Parameters:
//   - raw: The registry value, a Node.js directory or node.exe path
//
// Returns:
//   - string: The normalised path, "" when the value holds nothing usable
func normaliseRegistryNodePath(raw string) string {
	path := strings.TrimSpace(raw)
	path = strings.Trim(path, `"`)
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if !strings.EqualFold(filepath.Ext(path), ".exe") {
		path = filepath.Join(path, "node.exe")
	}
	return path
}

// nodePathsFromRegistry returns node.exe candidates read from the Windows
// registry, in the order they were found. MSI installs register their
// installation in SOFTWARE\Node.js, and some installs only leave an App Paths
// entry pointing straight at node.exe behind. Both 64-bit and 32-bit registry
// views are consulted, so a 32-bit Node.js stays visible from a 64-bit
// installer. The current-user hive is read as well, but a per-user install it
// reveals is rejected later by the user-path check in DetectSystemNode.
//
// Returns:
//   - []string: The unique candidate paths, empty when the registry names none
func nodePathsFromRegistry() []string {
	var candidates []string
	seen := map[string]bool{}

	add := func(raw string) {
		path := normaliseRegistryNodePath(raw)
		if path == "" {
			return
		}
		key := strings.ToLower(path)
		if seen[key] {
			return
		}
		seen[key] = true
		candidates = append(candidates, path)
	}

	roots := []registry.Key{registry.LOCAL_MACHINE, registry.CURRENT_USER}
	keyPaths := []string{`SOFTWARE\Node.js`, `SOFTWARE\WOW6432Node\Node.js`}
	accesses := []uint32{
		registry.QUERY_VALUE | registry.WOW64_64KEY,
		registry.QUERY_VALUE | registry.WOW64_32KEY,
	}

	for _, root := range roots {
		for _, keyPath := range keyPaths {
			for _, access := range accesses {
				key, err := registry.OpenKey(root, keyPath, access)
				if err != nil {
					continue
				}
				for _, valueName := range nodeRegistryValueNames {
					if value, _, err := key.GetStringValue(valueName); err == nil {
						add(value)
					}
				}
				key.Close()
			}
		}
	}

	// App Paths fallback for installs that registered one without leaving
	// SOFTWARE\Node.js behind. Its default value points directly at node.exe.
	appPathsKey := `SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\node.exe`
	for _, access := range accesses {
		key, err := registry.OpenKey(registry.LOCAL_MACHINE, appPathsKey, access)
		if err != nil {
			continue
		}
		if value, _, err := key.GetStringValue(""); err == nil {
			add(value)
		}
		key.Close()
	}

	if len(candidates) > 0 {
		logger.Debug("Node.js install paths found in the Windows registry: %s", strings.Join(candidates, ", "))
	}

	return candidates
}

// systemNodeCandidates returns the locations a system-wide Node.js is accepted
// from: the install paths registered in the Windows registry by MSI installs
// first, then the conventional %ProgramFiles% locations covering non-MSI and
// portable installs. Every candidate still has to pass the checks in
// DetectSystemNode, so a registered path that is invalid, user-owned or too
// old is skipped there.
//
// Returns:
//   - []string: The absolute candidate node.exe paths, empty when none is known
//
func systemNodeCandidates() []string {
	candidates := nodePathsFromRegistry()
	for _, envVar := range []string{"ProgramFiles", "ProgramFiles(x86)"} {
		if programFiles := os.Getenv(envVar); programFiles != "" {
			candidates = append(candidates, filepath.Join(programFiles, "nodejs", "node.exe"))
		}
	}
	return candidates
}
