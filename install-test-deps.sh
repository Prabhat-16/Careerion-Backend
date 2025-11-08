#!/bin/bash

# Install Backend Testing Dependencies

echo "Installing Jest and Testing Libraries..."

npm install --save-dev \
  jest \
  supertest \
  mongodb-memory-server \
  @types/jest \
  @types/supertest

echo "✅ Testing dependencies installed successfully!"
echo ""
echo "Run tests with:"
echo "  npm test              # Run tests once"
echo "  npm run test:watch    # Run tests in watch mode"
echo "  npm run test:coverage # Run tests with coverage"
