-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "reminder_log" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "status" "ReminderStatus" NOT NULL,
    "outstanding_count" INTEGER NOT NULL,
    "error" TEXT,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_log_period_idx" ON "reminder_log"("period");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_log_user_id_period_key" ON "reminder_log"("user_id", "period");

-- AddForeignKey
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

