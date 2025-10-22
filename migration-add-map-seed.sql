-- ========================================
-- Migration: Add Map Seed to Lobbies
-- ========================================
-- Run this in your Supabase SQL Editor

-- Add map_seed column to lobbies table
ALTER TABLE public.lobbies 
ADD COLUMN IF NOT EXISTS map_seed integer;

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lobbies' 
    AND column_name = 'map_seed'
  ) THEN
    RAISE NOTICE 'Column map_seed added successfully!';
  ELSE
    RAISE EXCEPTION 'Failed to add map_seed column';
  END IF;
END;
$$;


















