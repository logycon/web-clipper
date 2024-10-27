 #!/bin/bash

# Check if the PNG file is provided
if [ $# -eq 0 ]; then
    echo "Please provide the path to your PNG file."
    exit 1
fi

# Get the PNG file path
PNG_FILE=$1
 
convert $1 -background white -alpha remove -alpha off $1_white.png

echo "Icon $1_white.png has been created successfully."