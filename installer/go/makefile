.PHONY: help build clean lint fmt vet check-quality
APP_NAME=flowfuse-device-installer
VERSION:=$(shell grep -o '"version": "[^"]*"' ../../package.json | sed 's/"version": "//;s/"//')


build: ## builds the application for all platforms
	mkdir -p out/{linux,macos,windows}
	@echo "Building ${APP_NAME} version ${VERSION}..."
	GOARCH=amd64 GOOS=linux go build -ldflags "-X main.version=${VERSION}" -o ./out/linux/${APP_NAME}-linux-amd64 main.go
	GOARCH=arm64 GOOS=linux go build -ldflags "-X main.version=${VERSION}" -o ./out/linux/${APP_NAME}-linux-arm64 main.go
	GOARCH=arm GOOS=linux go build -ldflags "-X main.version=${VERSION}" -o ./out/linux/${APP_NAME}-linux-arm main.go

clean: ## cleans the build artifacts
	go clean
	rm -rf ./out/*


## Quality checks
check-quality: ## runs code quality checks
	make lint
	make fmt
	make vet

lint: ## go linting. Update and use specific lint tool and options
	golangci-lint run --enable-all

vet: ## go vet
	go vet ./...

fmt: ## runs go formatter
	go fmt ./...

## Help
help: ## Show this help.
	@echo ''
	@echo 'Usage:'
	@echo '  ${YELLOW}make${RESET} ${GREEN}<target>${RESET}'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} { \
		if (/^[a-zA-Z_-]+:.*?##.*$$/) {printf "    ${YELLOW}%-20s${GREEN}%s${RESET}\n", $$1, $$2} \
		else if (/^## .*$$/) {printf "  ${CYAN}%s${RESET}\n", substr($$1,4)} \
		}' $(MAKEFILE_LIST)
