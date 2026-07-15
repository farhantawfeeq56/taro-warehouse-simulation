-- Migration: allow many warehouses per project
-- Drop the unique constraint that enforced one warehouse per project

ALTER TABLE "warehouses" DROP CONSTRAINT IF EXISTS "warehouses_project_id_unique";
