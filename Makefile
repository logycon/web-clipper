# Variables
ZIP_NAME = extension.zip
FILES = manifest.json content.js background.js popup.html popup.js styles.css

# Default target
all: clean build

# Clean existing zip
clean:
	@echo "Cleaning..."
	@rm -f $(ZIP_NAME)

# Build the zip
build:
	@echo "Creating $(ZIP_NAME)..."
	@zip -q $(ZIP_NAME) $(FILES)
	@echo "Files included in $(ZIP_NAME):"
	@for file in $(FILES); do echo "- $$file"; done
	@echo "Done!"

# Show help
help:
	@echo "Available commands:"
	@echo "  make       - Clean and build extension.zip"
	@echo "  make clean - Remove existing extension.zip"
	@echo "  make build - Create new extension.zip"
	@echo "  make help  - Show this help message"

.PHONY: all clean build help
