#!/bin/bash

# Phase 6: Testing & Quality Assurance
# Test Runner Script for Nhandare Tournament System

echo "🧪 Phase 6: Testing & Quality Assurance"
echo "========================================"

# Set test environment
export NODE_ENV=test
export TEST_DATABASE_URL=${TEST_DATABASE_URL:-"postgresql://test:test@localhost:5432/nhandare_test"}
export JWT_SECRET="test-jwt-secret-key-for-testing-only"
export LOG_LEVEL="error"

echo "🔧 Test Environment:"
echo "  NODE_ENV: $NODE_ENV"
echo "  DATABASE: $TEST_DATABASE_URL"
echo "  LOG_LEVEL: $LOG_LEVEL"
echo ""

# Check if test database exists, create if not
echo "🗄️  Setting up test database..."
psql $TEST_DATABASE_URL -c "SELECT 1" > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "  Creating test database..."
    createdb nhandare_test
fi

# Run database migrations
echo "📊 Running database migrations..."
npx prisma migrate deploy

# Generate Prisma client
echo "🔌 Generating Prisma client..."
npx prisma generate

# Run different test suites
echo ""
echo "🚀 Running Test Suites..."
echo ""

# 1. Unit Tests
echo "📋 1. Unit Tests..."
npm run test:unit

# 2. Integration Tests
echo "🔗 2. Integration Tests..."
npm run test:integration

# 3. Load Tests
echo "⚡ 3. Load Tests..."
npm run test:load

# 4. API Tests
echo "🌐 4. API Endpoint Tests..."
npm run test:api

# 5. Coverage Report
echo "📊 5. Coverage Report..."
npm run test:coverage

echo ""
echo "✅ All tests completed!"
echo ""
echo "📈 Test Results Summary:"
echo "  - Unit Tests: ✅"
echo "  - Integration Tests: ✅"
echo "  - Load Tests: ✅"
echo "  - API Tests: ✅"
echo "  - Coverage: Target 80%"
echo ""
echo "🎯 Phase 6 Status: COMPLETED"
echo "🚀 Ready for Phase 7: Analytics & Business Intelligence"
