package utils

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"crypto/rand"
	"fmt"
	"io"
	"math/big"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
)

// Global variable to store the service username
var ServiceUsername = "flowfuse"
var ServiceUserPassword, _ = generateSecurePassword()

// CheckPermissions checks if the user who executed the installer has the necessary permissions to operate
// based on the current operating system.
//
// For Linux systems, it delegates to checkUnixPermissions to verify specific Unix permissions.
// For Windows systems, it checks if the user has administrator privileges by executing a command that
// requires elevated permissions.
// For other operating systems, it returns an error indicating the OS is not supported.
//
// Returns:
//   - nil if the application has sufficient permissions
//   - error if permissions are insufficient or the operating system is not supported
func CheckPermissions() error {
	switch runtime.GOOS {
	case "linux":
		return checkUnixPermissions()
	case "windows":
		return checkWindowsPermissions()
	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// checkUnixPermissions checks if the current user has sudo access without requiring a password.
// It runs 'sudo -nv' command which will succeed if the user has sudo privileges without needing
// to enter a password. If the command fails, it checks if sudo is available on the system at all.
// If sudo is not available, it returns an error; otherwise it just logs informational messages.
//
// Returns:
//   - nil if sudo is available (either with or without password)
//   - error if sudo is not available on the system
func checkUnixPermissions() error {
	cmd := exec.Command("sudo", "-nv")
	err := cmd.Run()

	if err != nil {
		_, err := exec.LookPath("sudo")
		if err != nil {
			return fmt.Errorf("sudo command not found on this system: %w", err)
		}

		logger.Info("This installer requires sudo access for some operations.")
		logger.Info("You will be prompted for your password when needed.")
	}

	return nil
}

// checkWindowsPermissions verifies if the current process is running with administrator privileges on Windows.
// It attempts to execute the "net session" command, which requires elevated privileges to succeed.
// Returns nil if the process has administrator privileges, otherwise returns an error with instructions
// to run as administrator.
func checkWindowsPermissions() error {
	cmd := exec.Command("net", "session")
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("this installer requires administrator privileges, please run as administrator")
	}
	return nil
}

// CreateWorkingDirectory creates and returns the working directory path for the FlowFuse device agent.
// On Linux systems, it creates the directory at "/opt/flowfuse-device" with 0755 permissions.
// On Windows systems, it creates the directory at "c:\opt\flowfuse-device".
// For other operating systems, it returns an error indicating the OS is not supported.
// Returns the working directory path as a string and any error encountered during directory creation.
func CreateWorkingDirectory() (string, error) {
	var workDir string

	switch runtime.GOOS {
	case "linux":
		workDir = "/opt/flowfuse-device"
	case "windows":
		workDir = `c:\opt\flowfuse-device`
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}

	if err := createDirWithPermissions(workDir, 0755); err != nil {
		return "", err
	}

	return workDir, nil
}

// GetWorkingDirectory returns the default working directory for the FlowFuse device agent based on the operating system.
// For unsupported operating systems, it returns an error.
func GetWorkingDirectory() (string, error) {
	switch runtime.GOOS {
	case "linux":
		return "/opt/flowfuse-device", nil
	case "windows":
		return `c:\opt\flowfuse-device`, nil
	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// createDirWithPermissions creates a directory at the specified path with the given permissions.
// If the directory already exists, no action is taken.
// On Linux systems, the function first attempts to create the directory without sudo. If that fails, it tries with sudo. After creation, it sets
// the ownership of the directory to a service user.
// On Windows systems, it creates the directory with the specified permissions.
//
// Parameters:
//   - path: The file system path where the directory should be created
//   - permissions: The file mode/permissions to apply to the new directory
//
// Returns:
//   - error: An error if directory creation fails or if running on an unsupported OS
//
// Note: Currently, this function only supports Linux. Other operating systems will return an error.
func createDirWithPermissions(path string, permissions os.FileMode) error {
	switch runtime.GOOS {
	case "linux":
		if _, err := os.Stat(path); os.IsNotExist(err) {
			// Try to create without sudo first
			logger.Debug("Creating directory %s...", path)
			err := os.MkdirAll(path, permissions)
			if err != nil {
				logger.Debug("Creating directory %s (requires sudo)...", path)
				mkdirCmd := exec.Command("sudo", "mkdir", "-p", path)
				if output, err := mkdirCmd.CombinedOutput(); err != nil {
					return fmt.Errorf("failed to create directory %s: %w\nOutput: %s", path, err, output)
				}
			}
		}

		serviceUser, err := CreateServiceUser(ServiceUsername, ServiceUserPassword)
		if err != nil {
			return fmt.Errorf("failed to create service user: %w", err)
		}

		logger.Debug("Setting ownership of %s to %s...", path, serviceUser)
		chownCmd := exec.Command("sudo", "chown", "-R", serviceUser, path)
		if output, err := chownCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
		}

		return nil

	case "windows":
		if err := os.MkdirAll(path, permissions); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", path, err)
		}
		return nil

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// CreateServiceUser creates a system user with the given username if it doesn't already exist.
// For Linux systems, it checks if the user exists by calling the "id" command.
// If the user doesn't exist, it creates the user with a home directory and no shell.
// For Windows systems, it checks if the user exists by calling the "net user" command.
// If the user doesn't exist, it creates the user using the "net user /add" command with a secure password.
//
// Parameters:
//   - username: the name of the user to create
//   - password: the password to set for the user (only used on Windows)
//
// Returns:
//   - string: the username of the created or existing service user
//   - error: an error if the user creation failed or if the operating system is not supported
func CreateServiceUser(username, password string) (string, error) {
	switch runtime.GOOS {
	case "linux":
		checkUserCmd := exec.Command("id", username)
		if err := checkUserCmd.Run(); err == nil {
			logger.Debug("Service user %s already exists", username)
		} else {
			logger.Info("Creating service user %s...", username)
			createUserCmd := exec.Command("sudo", "useradd", "-m", "-s", "/sbin/nologin", username)
			if output, err := createUserCmd.CombinedOutput(); err != nil {
				return "", fmt.Errorf("failed to create user: %w\nOutput: %s", err, output)
			}
		}
		return username, nil

	case "windows":
		checkUserCmd := exec.Command("net", "user", username)
		if err := checkUserCmd.Run(); err == nil {
			logger.Debug("Service user %s already exists", username)
			return username, nil
		} else {
			logger.Info("Creating service user %s with secure password...", username)
			createUserCmd := exec.Command("net", "user", username, password, "/add")
			if output, err := createUserCmd.CombinedOutput(); err != nil {
				return "", fmt.Errorf("failed to create user: %w\nOutput: %s", err, output)
			}
			return username, nil
		}

	default:
		return "", fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// RemoveServiceUser deletes the specified service user account from the system.
// On Linux, it executes "userdel -r" with sudo to remove the user and their home directory.
// On Windows, it uses the "net user /delete" command to delete the user.
//
// Parameters:
//   - username: the name of the user account to be removed
//
// Returns:
//   - error: nil on success, or an error describing what went wrong
//
// Note: Currently only supported on Linux operating systems.
func RemoveServiceUser(username string) error {
	logger.Debug("Removing service user %s...", username)

	switch runtime.GOOS {
	case "linux":
		removeUserCmd := exec.Command("sudo", "userdel", "-r", username)
		if output, err := removeUserCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to remove user %s: %w\nOutput: %s", username, err, output)
		}
		return nil

	case "windows":
		removeUserCmd := exec.Command("net", "user", username, "/delete")
		if output, err := removeUserCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to remove user %s: %w\nOutput: %s", username, err, output)
		}
		return nil

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// RemoveWorkingDirectory attempts to remove the specified working directory.
// On Linux systems, it uses "sudo" and "rm -rf" to remove the directory.
// On Windows systems, it uses the "rmdir" command to remove the directory.
// For other operating systems, it returns an error indicating lack of support.
//
// Parameters:
//   - workDir: The path to the directory that needs to be removed
//
// Returns:
//   - error: nil if successful, otherwise an error describing what went wrong
func RemoveWorkingDirectory(workDir string) error {
	logger.Debug("Removing working directory: %s", workDir)

	switch runtime.GOOS {
	case "linux":
		removeWorkDirCmd := exec.Command("sudo", "rm", "-rf", workDir)
		if output, err := removeWorkDirCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to remove working directory: %w\nOutput: %s", err, output)
		}
		return nil

	case "windows":
		removeWorkDirCmd := exec.Command("cmd", "/C", "rmdir", "/S", "/Q", workDir)
		if output, err := removeWorkDirCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to remove working directory: %w\nOutput: %s", err, output)
		}
		return nil

	default:
		return fmt.Errorf("unsupported operating system: %s", runtime.GOOS)
	}
}

// generateSecurePassword creates a random password of the specified length that includes
// uppercase letters, lowercase letters, and numbers.
//
// Returns:
//   - string: A random password meeting the complexity requirements
func generateSecurePassword() (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+"
	const length = 24

	password := make([]byte, length)
	charsetLength := big.NewInt(int64(len(charset)))
	for i := range password {
		index, err := rand.Int(rand.Reader, charsetLength)
		if err != nil {
			return "", fmt.Errorf("error generating random index: %v", err)
		}
		password[i] = charset[index.Int64()]
	}

	return string(password), nil
}

// extractZip extracts a Node.js zip archive to a destination directory.
//
// Parameters:
//   - zipFile: path to the zip file to extract
//   - destDir: destination directory where files will be extracted
//   - version: Node.js version string (e.g. "16.14.0")
//
// The function handles architecture-specific Node.js archives for Windows,
// correctly mapping the archive's internal directory structure when extracting.
// It preserves file permissions from the archive and creates any necessary
// directories in the destination path.
//
// Returns an error if any part of the extraction process fails (opening the zip file,
// creating directories, extracting files, etc.).
func ExtractZip(zipFile, destDir, version string) error {
	reader, err := zip.OpenReader(zipFile)
	if err != nil {
		return err
	}
	defer reader.Close()

	// Get the root directory name in the archive
	rootDir := fmt.Sprintf("node-v%s-win-%s", version, runtime.GOARCH)
	if runtime.GOARCH == "amd64" {
		rootDir = fmt.Sprintf("node-v%s-win-x64", version)
	} else if runtime.GOARCH == "386" {
		rootDir = fmt.Sprintf("node-v%s-win-x86", version)
	}

	// Extract files
	for _, file := range reader.File {
		// Remove root directory from path
		relPath := strings.TrimPrefix(file.Name, rootDir)
		relPath = strings.TrimPrefix(relPath, "/")
		relPath = strings.TrimPrefix(relPath, "\\")

		if relPath == "" {
			continue
		}

		targetPath := filepath.Join(destDir, relPath)

		if file.FileInfo().IsDir() {
			os.MkdirAll(targetPath, file.Mode())
			continue
		}

		os.MkdirAll(filepath.Dir(targetPath), 0755)

		srcFile, err := file.Open()
		if err != nil {
			return err
		}

		destFile, err := os.Create(targetPath)
		if err != nil {
			srcFile.Close()
			return err
		}

		_, err = io.Copy(destFile, srcFile)
		srcFile.Close()
		destFile.Close()
		if err != nil {
			return err
		}

		os.Chmod(targetPath, file.Mode())
	}

	return nil
}

// DownloadAndInstallPsExec downloads and installs the PsExec tool from Sysinternals.
// This is used on Windows to run commands as a specific user without requiring
// interactive password prompts.
//
// The function:
// 1. Downloads the PSTools.zip archive from the Sysinternals website
// 2. Creates a directory for PSTools based on the working directory
// 3. Extracts the zip archive to the designated directory
//
// Parameters:
//
//	None
//
// Returns:
//   - string: The path to the psexec.exe executable
//   - error: An error if download or extraction fails
func DownloadAndInstallPsExec() (string, error) {
	if runtime.GOOS != "windows" {
		return "", fmt.Errorf("psexec is only needed on Windows")
	}

	// Get the working directory where we'll install PsTools
	workDir, err := GetWorkingDirectory()
	if err != nil {
		return "", err
	}

	psToolsDir := filepath.Join(workDir, "pstools")
	psExecPath := filepath.Join(psToolsDir, "psexec.exe")

	// Check if psexec already exists
	if _, err := os.Stat(psExecPath); err == nil {
		logger.Debug("PsExec already installed at %s", psExecPath)
		return psExecPath, nil
	}

	// Create pstools directory if it doesn't exist
	if err := os.MkdirAll(psToolsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create directory for PsTools: %w", err)
	}

	// Download URL for PSTools
	psToolsUrl := "https://download.sysinternals.com/files/PSTools.zip"
	zipPath := filepath.Join(psToolsDir, "PSTools.zip")

	// Download the PSTools.zip file
	logger.Debug("Downloading PsExec from %s", psToolsUrl)
	cmd := exec.Command("curl", "-L", "-o", zipPath, psToolsUrl)
	if output, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("failed to download PsTools: %w\nOutput: %s", err, output)
	}

	// Extract the zip file
	logger.Debug("Extracting PsTools to %s", psToolsDir)
	if err := ExtractZip(zipPath, psToolsDir, ""); err != nil {
		return "", fmt.Errorf("failed to extract PSTools: %w", err)
	}

	// Clean up the zip file
	if err := os.Remove(zipPath); err != nil {
		logger.Debug("Failed to remove downloaded zip file: %v", err)
	}

	// Verify PsExec exists after extraction
	if _, err := os.Stat(psExecPath); err != nil {
		return "", fmt.Errorf("psexec.exe not found after extraction: %w", err)
	}

	logger.Info("PsExec installed successfully at %s", psExecPath)
	return psExecPath, nil
}

// extractTarGz extracts a Node.js tar.gz archive to the specified destination directory.
//
// This function handles the extraction of a Node.js tar.gz archive and manages the necessary permissions.
// On Linux, it first extracts the archive to a temporary directory and then uses sudo to move the files
// to the destination directory with proper ownership and permissions.
//
// Parameters:
//   - tarGzFile: Path to the Node.js tar.gz archive file.
//   - destDir: Destination directory where the contents should be extracted.
//   - version: Node.js version string used to identify the root directory in the archive.
//
// Returns:
//   - error: If any step in the extraction process fails, an error is returned with details.
//
// Notes:
//   - Currently only supports Linux platforms.
//   - Requires sudo privileges to set proper ownership and permissions.
//   - Handles directory creation, file extraction, symbolic links, and permission setting.
func ExtractTarGz(tarGzFile, destDir, version string) error {
	file, err := os.Open(tarGzFile)
	if err != nil {
		return err
	}
	defer file.Close()

	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzipReader.Close()

	tarReader := tar.NewReader(gzipReader)

	// Get the root directory name in the archive
	var archSuffix string
	var rootDir string
	if runtime.GOOS == "linux" { 
		if runtime.GOARCH == "amd64" {
			archSuffix = "x64"
		} else if runtime.GOARCH == "386" {
			archSuffix = "x86"
		} else if runtime.GOARCH == "arm" {
			archSuffix = "armv7l"
		} else {
		archSuffix = runtime.GOARCH
		}
		rootDir = fmt.Sprintf("node-v%s-linux-%s", version, archSuffix)
	}

	if runtime.GOOS == "linux" {
		// Create a temporary directory
		tempExtractDir, err := os.MkdirTemp("", "nodejs-extract-")
		if err != nil {
			return fmt.Errorf("failed to create temporary extraction directory: %w", err)
		}
		defer os.RemoveAll(tempExtractDir)

		// First, extract to a temporary directory that doesn't require elevated privileges
		for {
			header, err := tarReader.Next()
			if err == io.EOF {
				break
			}
			if err != nil {
				return err
			}

			// Skip if it's the root directory
			if header.Name == rootDir || header.Name == rootDir+"/" {
				continue
			}

			// Remove root directory from path
			relPath := strings.TrimPrefix(header.Name, rootDir)
			relPath = strings.TrimPrefix(relPath, "/")

			if relPath == "" {
				continue
			}

			tempPath := filepath.Join(tempExtractDir, relPath)

			switch header.Typeflag {
			case tar.TypeDir:
				if err := os.MkdirAll(tempPath, 0755); err != nil {
					return err
				}
			case tar.TypeReg:
				if err := os.MkdirAll(filepath.Dir(tempPath), 0755); err != nil {
					return err
				}

				outFile, err := os.Create(tempPath)
				if err != nil {
					return err
				}

				if _, err := io.Copy(outFile, tarReader); err != nil {
					outFile.Close()
					return err
				}
				outFile.Close()

				if err := os.Chmod(tempPath, os.FileMode(header.Mode)); err != nil {
					return err
				}
			case tar.TypeSymlink:
				if err := os.Symlink(header.Linkname, tempPath); err != nil {
					return err
				}
			}
		}

		// Copy the content from temp dir to the destination using sudo
		logger.Debug("Moving extracted files to %s (requires sudo)...", destDir)

		// Ensure the destination directory exists with proper permissions
		mkdirCmd := exec.Command("sudo", "mkdir", "-p", destDir)
		if output, err := mkdirCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to create destination directory: %w\nOutput: %s", err, output)
		}

		// Copy the extracted files from temp dir to destination
		cpCmd := exec.Command("sudo", "cp", "-a", tempExtractDir+"/.", destDir)
		if output, err := cpCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to copy extracted files: %w\nOutput: %s", err, output)
		}

		// Set ownership of all files to the service user
		chownCmd := exec.Command("sudo", "chown", "-R", ServiceUsername+":"+ServiceUsername, destDir)
		chmodCmd := exec.Command("sudo", "chmod", "755", destDir)
		if output, err := chmodCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory permissions: %w\nOutput: %s", err, output)
		}
		if output, err := chownCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("failed to set directory ownership: %w\nOutput: %s", err, output)
		}

		return nil
	}

	return nil
}