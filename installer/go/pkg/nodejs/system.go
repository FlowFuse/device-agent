package nodejs

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/utils"

	"golang.org/x/mod/semver"
)

// userPathPrefixes lists the path prefixes that mark a per-user installation.
// A runtime living under one of these belongs to the account that installed it,
// not to the machine, so the service account cannot be expected to reach it.
var userPathPrefixes = []string{"/home/", "/Users/", "/root", `c:\users\`}

// systemNodeCandidates returns the fixed locations a system-wide Node.js is
// accepted from, for the current operating system.
//
// Returns:
//   - []string: The absolute candidate paths, empty on an unsupported system
func systemNodeCandidates() []string {
	switch runtime.GOOS {
	case "linux":
		return []string{"/usr/bin/node", "/usr/local/bin/node"}
	case "darwin":
		return []string{"/usr/local/bin/node", "/opt/homebrew/bin/node"}
	case "windows":
		var candidates []string
		for _, envVar := range []string{"ProgramFiles", "ProgramFiles(x86)"} {
			if programFiles := os.Getenv(envVar); programFiles != "" {
				candidates = append(candidates, filepath.Join(programFiles, "nodejs", "node.exe"))
			}
		}
		return candidates
	default:
		return nil
	}
}

// npmExecutableName returns the name of the npm executable on this platform.
//
// Returns:
//   - string: "npm.cmd" on Windows, "npm" elsewhere
func npmExecutableName() string {
	if runtime.GOOS == "windows" {
		return "npm.cmd"
	}
	return "npm"
}

// isUserPath reports whether a resolved path lies under a user home directory,
// which disqualifies it as a system-wide installation. It is applied to the
// symlink-resolved path, so a system location pointing into a home directory is
// rejected as well.
//
// Parameters:
//   - path: An absolute, symlink-resolved path
//
// Returns:
//   - bool: true when the path belongs to a user home directory
func isUserPath(path string) bool {
	normalised := path
	if runtime.GOOS == "windows" {
		normalised = strings.ToLower(path)
	}
	for _, prefix := range userPathPrefixes {
		if strings.HasPrefix(normalised, prefix) {
			return true
		}
	}
	return false
}

// systemNodeVersion runs a candidate binary and returns the version it reports.
//
// On Linux and macOS the binary is run through "sudo -u <serviceUser>". 
// Running the probe as the service account tests exactly the condition that matters.
//
// Parameters:
//   - nodePath: The absolute path to the candidate node binary
//
// Returns:
//   - string: The reported version, without the leading "v"
//   - error: An error if the binary cannot be run or reports nothing usable
func systemNodeVersion(nodePath string) (string, error) {
	var versionCmd *exec.Cmd
	switch runtime.GOOS {
	case "linux", "darwin":
		versionCmd = exec.Command("sudo", "-n", "-u", utils.ServiceUsername, nodePath, "--version")
	case "windows":
		versionCmd = exec.Command(nodePath, "--version")
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	output, err := versionCmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("failed to run %s: %w\nOutput: %s", nodePath, err, output)
	}

	version := strings.TrimSpace(string(output))
	version = strings.TrimPrefix(version, "v")
	if version == "" {
		return "", fmt.Errorf("%s reported no version", nodePath)
	}

	return version, nil
}

// normaliseVersion returns a version in the form golang.org/x/mod/semver expects,
// which is a leading "v".
//
// Parameters:
//   - version: A Node.js version string, with or without the leading "v"
//
// Returns:
//   - string: The version with a leading "v", or unchanged when it is empty
func normaliseVersion(version string) string {
	trimmed := strings.TrimSpace(version)
	if trimmed == "" || strings.HasPrefix(trimmed, "v") {
		return trimmed
	}
	return "v" + trimmed
}

// ValidateVersion reports whether a Node.js version string can be understood as a
// semantic version.
//
// Parameters:
//   - version: The version string to check, with or without the leading "v"
//
// Returns:
//   - error: An error naming the offending value, nil when it is usable
func ValidateVersion(version string) error {
	normalised := normaliseVersion(version)

	if !semver.IsValid(normalised) || semver.Canonical(normalised) != normalised {
		return fmt.Errorf("invalid Node.js version %q, expected a full version such as 22.23.0", version)
	}

	return nil
}

// DetectSystemNode looks for a usable system-wide Node.js installation.
//
// A candidate qualifies when it is a regular file, its real path lies outside
// any user home directory, npm sits beside it, the service account can execute
// it, and the version it reports is at least minVersion. npm is required because
// the installer uses it to install the agent package, and the agent itself shells
// out to it to install Node-RED dependencies at runtime.
//
// Parameters:
//   - minVersion: The lowest acceptable Node.js version, a leading "v" is tolerated
//
// Returns:
//   - string: The directory holding the accepted node and npm, "" when none qualifies
//   - string: The version the accepted binary reports, "" when none qualifies
func DetectSystemNode(minVersion string) (string, string) {
	logger.LogFunctionEntry("DetectSystemNode", map[string]interface{}{
		"minVersion": minVersion,
	})

	if err := ValidateVersion(minVersion); err != nil {
		logger.Debug("Not looking for a system Node.js: %v", err)
		logger.LogFunctionExit("DetectSystemNode", "none", nil)
		return "", ""
	}

	for _, candidate := range systemNodeCandidates() {
		info, err := os.Stat(candidate)
		if err != nil || !info.Mode().IsRegular() {
			logger.Debug("No system Node.js at %s", candidate)
			continue
		}

		realPath, err := filepath.EvalSymlinks(candidate)
		if err != nil {
			logger.Debug("Ignoring %s: cannot resolve it: %v", candidate, err)
			continue
		}
		if isUserPath(realPath) {
			logger.Debug("Ignoring %s: resolves to %s inside a user home directory", candidate, realPath)
			continue
		}

		candidateDir := filepath.Dir(candidate)
		npmPath := filepath.Join(candidateDir, npmExecutableName())
		if _, err := os.Stat(npmPath); err != nil {
			logger.Debug("Ignoring %s: no npm alongside it at %s", candidate, npmPath)
			continue
		}

		version, err := systemNodeVersion(candidate)
		if err != nil {
			logger.Debug("Ignoring %s: the service account cannot run it: %v", candidate, err)
			continue
		}

		if semver.Compare(normaliseVersion(version), normaliseVersion(minVersion)) < 0 {
			logger.Info("Node.js %s runtime found in %s, but it does not meet the minimum required version %s .",
				version, candidateDir, minVersion)
			continue
		}

		logger.Debug("Accepted system Node.js %s in %s", version, candidateDir)
		logger.LogFunctionExit("DetectSystemNode", candidateDir, nil)
		return candidateDir, version
	}

	logger.LogFunctionExit("DetectSystemNode", "none", nil)
	return "", ""
}
