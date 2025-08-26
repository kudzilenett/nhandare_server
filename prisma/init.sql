-- PostgreSQL initialization script for Nhandare Gaming Platform
-- This script runs when the PostgreSQL container starts for the first time

-- Create the database if it doesn't exist
-- Note: The database is already created by POSTGRES_DB environment variable
-- This script runs after the database is created

-- Set timezone
SET timezone = 'UTC';

-- Create extensions that might be needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Grant necessary permissions to the application user
GRANT ALL PRIVILEGES ON DATABASE nhandare_gaming TO nhandare_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO nhandare_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nhandare_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nhandare_user;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO nhandare_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO nhandare_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO nhandare_user;

-- Create indexes for better performance (these will be created by Prisma migrations, but good to have as backup)
-- Note: These are just examples and should match your actual schema

-- Log the initialization
DO $$
BEGIN
    RAISE NOTICE 'Nhandare Gaming Platform database initialized successfully';
    RAISE NOTICE 'Database: %', current_database();
    RAISE NOTICE 'User: %', current_user;
    RAISE NOTICE 'Time: %', now();
END $$;
