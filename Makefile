# Define variables
BUILD_DIR := dist
ZIP_NAME := web-clipper.zip

# Default target
.DEFAULT_GOAL := help

# Help target
help:
	@echo "Available commands:"
	@echo "  make build  - Build the extension and create zip file"
	@echo "  make clean  - Remove the zip file"
	@echo "  make help   - Show this help message"

# Combined build and zip task
build:
	@echo "Building the extension..."
	# Add your existing build steps here
	
	@echo "Creating zip file for Chrome Web Store submission..."
	@mkdir -p $(BUILD_DIR)
	@zip -r $(BUILD_DIR)/$(ZIP_NAME) . \
		-x "*.git*" \
		-x "$(BUILD_DIR)/*" \
		-x "node_modules/*" \
		-x ".private/*" \
		-x "*.DS_Store" \
		-x "*.zip" \
		-x "*.sh" \
		-x "install.html" \
		-x "*.crx"
	@echo "Build complete. Zip file created at $(BUILD_DIR)/$(ZIP_NAME)"

# Clean task
clean:
	@echo "Removing zip file..."
	@rm -f $(BUILD_DIR)/$(ZIP_NAME)

.PHONY: help build clean
