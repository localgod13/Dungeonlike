-- ========================================
-- Migration: Add Class Selection to Lobby Members
-- ========================================
-- Run this in your Supabase SQL Editor

-- Add selected_class column to lobby_members table
ALTER TABLE public.lobby_members 
ADD COLUMN IF NOT EXISTS selected_class text;

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lobby_members' 
    AND column_name = 'selected_class'
  ) THEN
    RAISE NOTICE 'Column selected_class added successfully!';
  ELSE
    RAISE EXCEPTION 'Failed to add selected_class column';
  END IF;
END;
$$;

