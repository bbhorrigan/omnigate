#!/bin/bash

# Install dependencies
echo "Installing Node.js dependencies..."
npm install

# Start Docker containers
echo "Starting Docker containers..."
docker-compose up -d

# Wait for databases to be ready
echo "Waiting for databases to be ready..."
sleep 10

# Run the server
echo "Starting development server..."
npm run dev