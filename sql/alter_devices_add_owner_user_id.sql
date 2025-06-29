-- Add owner_user_id column to existing devices table
ALTER TABLE devices
ADD COLUMN IF NOT EXISTS owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add index for the new column
CREATE INDEX IF NOT EXISTS idx_devices_owner_user_id ON devices(owner_user_id);

COMMENT ON COLUMN devices.owner_user_id IS 'Foreign key referencing the user who owns/manages this device.';
