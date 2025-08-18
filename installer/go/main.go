package main

import (
	"fmt"
	"os"

	"github.com/flowfuse/device-agent-installer/cmd"
	"github.com/flowfuse/device-agent-installer/pkg/logger"
	"github.com/flowfuse/device-agent-installer/pkg/utils"
	"github.com/spf13/pflag"
)

var (
	agentVersion        string
	flowfuseURL         string
	flowfuseOneTimeCode string
	nodeVersion         string
	serviceUsername     string
	installDir          string
	instVersion         string
	showVersion         bool
	help                bool
	uninstall           bool
	updateNode          bool
	updateAgent         bool
	debugMode           bool
)

func init() {
	pflag.StringVarP(&nodeVersion, "nodejs-version", "n", "20.19.1", "Node.js version to install (minimum)")
	pflag.StringVarP(&agentVersion, "agent-version", "a", "latest", "Device agent version to install/update to")
	pflag.StringVarP(&serviceUsername, "service-user", "s", "flowfuse", "Username for the service account")
	pflag.StringVarP(&flowfuseURL, "url", "u", "https://app.flowfuse.com", "FlowFuse URL")
	pflag.StringVarP(&flowfuseOneTimeCode, "otc", "o", "", "FlowFuse one time code for authentication (optional for interactive installation)")
	pflag.StringVarP(&installDir, "dir", "d", "", "Custom installation directory (default: /opt/flowfuse-device on Unix, c:\\opt\\flowfuse-device on Windows)")
	pflag.BoolVarP(&showVersion, "version", "v", false, "Display installer version")
	pflag.BoolVarP(&help, "help", "h", false, "Display help information")
	pflag.BoolVar(&uninstall, "uninstall", false, "Uninstall the device agent")
	pflag.BoolVar(&updateNode, "update-nodejs", false, "Update bundled Node.js to specified version")
	pflag.BoolVar(&updateAgent, "update-agent", false, "Update the Device Agent package to specified version")
	pflag.BoolVar(&debugMode, "debug", false, "Enable debug logging")
	pflag.Parse()

	if help {
		fmt.Println("FlowFuse Device Agent Installer")
		fmt.Print("\n")
		fmt.Println("Usage:")
		fmt.Println("  Installation:")
		fmt.Println("    ./installer --otc <one-time-code> [--agent-version <version>] [--nodejs-version <version>]")
		fmt.Println("    ./installer [--agent-version <version>] [--nodejs-version <version>] (interactive mode)")
		fmt.Println("  Update:")
		fmt.Println("    ./installer --update-agent [--agent-version <version>]")
		fmt.Println("    ./installer --update-nodejs [--nodejs-version <version>]")
		fmt.Println("    ./installer --update-agent --update-nodejs [--agent-version <version>] [--nodejs-version <version>]")
		fmt.Println("  Uninstall:")
		fmt.Println("    ./installer --uninstall")
		fmt.Println("    ./installer --uninstall --dir <custom-working-directory>")
		fmt.Print("\n")
		fmt.Println("Options:")
		pflag.PrintDefaults()
		os.Exit(0)
	}

	if showVersion {
		fmt.Printf("FlowFuse Device Agent Installer Version: %s\n", instVersion)
		os.Exit(0)
	}

	if flowfuseOneTimeCode == "" && !uninstall && !updateNode && !updateAgent {
		fmt.Println("One time code has not been provided. The Device Agent automatic configuration is not possible.")
		response := utils.PromptYesNo("Do you want to continue with the installation?", false)
		if !response {
			fmt.Println("Installation aborted by user.")
			os.Exit(1)
		} else {
			fmt.Println("Continuing with installation in interactive mode...")
		}
	}
}

func main() {
	utils.ServiceUsername = serviceUsername
	var err error
	var exitCode int

	// Initialize logger
	if err := logger.Initialize(debugMode); err != nil {
		fmt.Printf("Warning: Failed to initialize logger: %s\n", err)
	} else {
		defer logger.Close()
	}

	// Log startup information
	logger.Debug("Command line arguments: node=%s, agent=%s, user=%s, url=%s, debug=%v",
		nodeVersion, agentVersion, serviceUsername, flowfuseURL, debugMode)
	operatingSystem, architecture := utils.GetOSDetails()
	logger.Debug("Detected system: %s, detected architecture: %s", operatingSystem, architecture)

	logger.Info("****************************************************************")
	logger.Info("*            FlowFuse Device Agent Installer                   *")
	logger.Info("*                                                              *")
	logger.Info("* This installer will set up the FlowFuse Device Agent on your *")
	logger.Info("* system and configure it to run as a system service.          *")
	logger.Info("*                                                              *")
	logger.Info("****************************************************************")

	if debugMode {
		logger.Info("Debug mode enabled. Logs will be written to: %s", logger.GetLogFilePath())
		logger.Debug("FlowFuse Device Agent Installer version: %s", instVersion)
	}

	if uninstall {
		err = cmd.Uninstall(installDir)
	} else if updateNode || updateAgent {
		logger.Info("Updating FlowFuse Device Agent...")
		err = cmd.Update(agentVersion, nodeVersion, installDir, updateAgent, updateNode)
	} else {
		logger.Info("Installing FlowFuse Device Agent...")

		err = cmd.Install(nodeVersion, agentVersion, flowfuseURL, flowfuseOneTimeCode, installDir, false)
	}

	if err != nil {
		exitCode = 1
	} else {
		exitCode = 0
	}

	os.Exit(exitCode)
}
