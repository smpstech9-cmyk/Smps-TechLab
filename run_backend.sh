#!/bin/bash
# Startup script for SMPS Tech Lab Backend (macOS/Linux)
echo "=========================================================="
echo "Starting SMPS Tech Lab Backend..."
echo "=========================================================="

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Check if venv exists
if [ -d "venv" ]; then
    echo "Activating virtual environment..."
    source venv/bin/activate
else
    echo "Warning: venv directory not found. Trying to run using system python..."
fi

# Run the backend
python app.py
