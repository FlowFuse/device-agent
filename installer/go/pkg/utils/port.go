package utils

import (
	"fmt"
	"net"
	"strconv"

	"github.com/flowfuse/device-agent-installer/pkg/logger"
)

// DefaultPort is the TCP port the Device Agent uses unless told otherwise.
const DefaultPort = 1880

// MinPort and MaxPort bound the TCP ports the Device Agent may be given. Ports
// below 1025 are privileged and the agent does not run as root.
const (
	MinPort = 1025
	MaxPort = 65535
)

// PortFlag is the value behind the installer's --port flag. Value stays nil
// until the flag is actually given, so an explicit "--port 1880" remains
// distinguishable from an omitted flag: the former is the user's answer, the
// latter means they have yet to be asked.
//
// It satisfies pflag.Value, which is a structural interface, so this package
// needs no dependency on pflag.
type PortFlag struct{ Value *int }

// Type reports the value kind shown in the generated help output.
func (p *PortFlag) Type() string { return "int" }

// String renders the current value, and the empty string while unset. Reading as
// a zero value when unset is what makes pflag omit its own "(default ...)" line,
// so the real default belongs in the flag description instead.
func (p *PortFlag) String() string {
	if p.Value == nil {
		return ""
	}
	return strconv.Itoa(*p.Value)
}

// Set parses and range-checks the port. Reporting the problem here lets pflag
// print it and exit, so the flag needs no separate validation by the caller.
func (p *PortFlag) Set(s string) error {
	value, err := strconv.Atoi(s)
	if err != nil {
		return fmt.Errorf("must be a number between %d and %d", MinPort, MaxPort)
	}
	if value < MinPort || value > MaxPort {
		return fmt.Errorf("must be between %d and %d", MinPort, MaxPort)
	}
	p.Value = &value
	return nil
}

// portBindHosts returns every address a listener on this host could be occupying:
// the IPv4 and IPv6 wildcards, plus each interface address (which includes the
// loopback addresses).
//
// Testing a single address is not enough. On macOS and the BSDs a bind to
// 127.0.0.1 succeeds while another process holds 0.0.0.0 on the same port, and
// neither wildcard conflicts with a listener bound to one specific interface
// address, so a port already taken would be offered as free.
//
// Link-local addresses are skipped: they need a zone identifier that
// net.InterfaceAddrs does not report, so binding them fails for reasons that
// have nothing to do with the port being taken.
//
// Returns:
//   - []string: The host addresses to test, without a port
func portBindHosts() []string {
	hosts := []string{"0.0.0.0", "::"}

	interfaceAddrs, err := net.InterfaceAddrs()
	if err != nil {
		logger.Debug("Could not list interface addresses, checking wildcards only: %v", err)
		return hosts
	}

	for _, addr := range interfaceAddrs {
		network, ok := addr.(*net.IPNet)
		if !ok || network.IP.IsLinkLocalUnicast() || network.IP.IsLinkLocalMulticast() {
			continue
		}
		hosts = append(hosts, network.IP.String())
	}

	return hosts
}

// CheckUnusedPort validates if specified TCP port is not in use by any process.
// The port has to be free on every address a listener could occupy, so that the
// Device Agent is never handed a port it cannot then bind.
//
// Parameters
//   - port: The TCP port to validate for availability.
//
// Returns:
//   - error: nil if the port is available, otherwise an error indicating the port is in use
func CheckUnusedPort(port int) error {
	logger.LogFunctionEntry("CheckUnusedPort", map[string]interface{}{
		"port": port,
	})

	for _, host := range portBindHosts() {
		address := net.JoinHostPort(host, strconv.Itoa(port))
		listener, err := net.Listen("tcp", address)
		if err != nil {
			logger.Debug("Port %d is unavailable on %s: %v", port, address, err)
			logger.LogFunctionExit("CheckUnusedPort", "error", err)
			return fmt.Errorf("port %d is in use. Please select another port and try again", port)
		}
		listener.Close()
	}

	logger.LogFunctionExit("CheckUnusedPort", "success", nil)
	return nil
}

// PromptPort asks the user which TCP port the Device Agent should listen on,
// re-prompting until a free port in the allowed range is given.
//
// Parameters:
//   - defaultPort: The port returned when the user provides no input
//
// Returns:
//   - int: The selected port
//   - error: An error if the input could not be read
func PromptPort(defaultPort int) (int, error) {
	for {
		answer, err := PromptText("Which TCP port should the FlowFuse Device Agent listen on?", strconv.Itoa(defaultPort))
		if err != nil {
			return 0, err
		}

		port, err := strconv.Atoi(answer)
		if err != nil || port < MinPort || port > MaxPort {
			fmt.Printf("Port must be a number between %d and %d.\n", MinPort, MaxPort)
			continue
		}

		if err := CheckUnusedPort(port); err != nil {
			fmt.Printf("%v\n", err)
			continue
		}

		return port, nil
	}
}
