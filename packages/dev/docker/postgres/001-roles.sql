CREATE ROLE carbon_app LOGIN PASSWORD 'carbon_app';
CREATE ROLE carbon_service LOGIN PASSWORD 'carbon_service' BYPASSRLS;

GRANT CONNECT ON DATABASE carbon TO carbon_app, carbon_service;
GRANT USAGE ON SCHEMA public TO carbon_app, carbon_service;
GRANT CREATE ON DATABASE carbon TO carbon_service;
GRANT CREATE ON SCHEMA public TO carbon_service;

ALTER DEFAULT PRIVILEGES FOR ROLE carbon IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO carbon_app, carbon_service;

ALTER DEFAULT PRIVILEGES FOR ROLE carbon IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO carbon_app, carbon_service;
