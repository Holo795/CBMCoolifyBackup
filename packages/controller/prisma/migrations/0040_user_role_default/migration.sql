-- A user created without an explicit role gets the least, not admin (the sign-up
-- gate always sets one: first user admin, invited users their invite's role).
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'viewer';
