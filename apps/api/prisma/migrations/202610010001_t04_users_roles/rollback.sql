-- Template for a NEW compensating migration after T-04, on an isolated test database.
-- Apply dependent migrations (such as T-09) in reverse dependency order first.
DROP TABLE "user_roles";
DROP TABLE "roles";
DROP TABLE "users";
