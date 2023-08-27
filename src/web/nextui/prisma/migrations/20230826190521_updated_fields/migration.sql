/*
  Warnings:

  - The values [COMPLETED] on the enum `JobStatus` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `updatedAt` to the `EvaluationJob` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `EvaluationResult` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "JobStatus_new" AS ENUM ('IN_PROGRESS', 'COMPLETE');
ALTER TABLE "EvaluationJob" ALTER COLUMN "status" TYPE "JobStatus_new" USING ("status"::text::"JobStatus_new");
ALTER TYPE "JobStatus" RENAME TO "JobStatus_old";
ALTER TYPE "JobStatus_new" RENAME TO "JobStatus";
DROP TYPE "JobStatus_old";
COMMIT;

-- AlterTable
ALTER TABLE "EvaluationJob" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "EvaluationResult" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
