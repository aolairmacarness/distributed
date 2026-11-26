-- AlterTable
ALTER TABLE "Job" ADD COLUMN "userId" INTEGER;

-- CreateIndex
CREATE INDEX "Job_userId_idx" ON "Job"("userId");
