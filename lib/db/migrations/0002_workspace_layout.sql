-- Migration: add workspace layout columns (position + rename)
-- Allow inline renaming and draggable node positions on the React Flow canvas.

ALTER TABLE "warehouses" ADD COLUMN "position_x" integer;
ALTER TABLE "warehouses" ADD COLUMN "position_y" integer;
