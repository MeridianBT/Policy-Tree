-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "entra_object_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "app_user_entra_object_id_key" ON "app_user"("entra_object_id");

