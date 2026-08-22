-- CreateEnum
CREATE TYPE "OrgUnitType" AS ENUM ('COMPANY', 'DIVISION', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'OWNER', 'VIEWER');

-- CreateEnum
CREATE TYPE "NodeKind" AS ENUM ('GOAL', 'THEME', 'OBJECTIVE');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('PERCENT', 'CURRENCY', 'COUNT', 'RATIO', 'DAYS', 'INDEX');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('HIGHER_BETTER', 'LOWER_BETTER');

-- CreateEnum
CREATE TYPE "AchievementMethod" AS ENUM ('RATIO', 'INVERSE');

-- CreateEnum
CREATE TYPE "Aggregation" AS ENUM ('SUM', 'AVERAGE', 'LATEST');

-- CreateTable
CREATE TABLE "ki" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ki_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_unit" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrgUnitType" NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "org_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "org_unit_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_version" (
    "id" TEXT NOT NULL,
    "ki_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "is_actual" BOOLEAN NOT NULL DEFAULT false,
    "locked_at" TIMESTAMP(3),

    CONSTRAINT "plan_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node" (
    "id" TEXT NOT NULL,
    "ki_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "level" INTEGER NOT NULL,
    "kind" "NodeKind" NOT NULL,
    "statement" TEXT NOT NULL,
    "org_unit_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_item" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "Unit" NOT NULL,
    "direction" "Direction" NOT NULL,
    "achievement_method" "AchievementMethod" NOT NULL,
    "aggregation" "Aggregation" NOT NULL,
    "decimal_places" INTEGER NOT NULL DEFAULT 0,
    "dic_org_unit_id" TEXT NOT NULL,
    "responsible_user_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "control_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry" (
    "id" TEXT NOT NULL,
    "control_item_id" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "plan_version_id" TEXT NOT NULL,
    "raw_value" DECIMAL(20,6),
    "formula" TEXT,
    "computed_value" DECIMAL(20,6),
    "error_code" TEXT,
    "error_message" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_audit" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "old_value" DECIMAL(20,6),
    "new_value" DECIMAL(20,6),
    "old_formula" TEXT,
    "new_formula" TEXT,
    "changed_by" TEXT,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_dependency" (
    "id" TEXT NOT NULL,
    "dependent_entry_id" TEXT NOT NULL,
    "target_control_item_id" TEXT NOT NULL,
    "target_period" DATE NOT NULL,
    "target_plan_version_id" TEXT NOT NULL,

    CONSTRAINT "entry_dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_band" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "min_pct" DECIMAL(10,4),
    "max_pct" DECIMAL(10,4),
    "color_hex" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evaluation_band_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ki_code_key" ON "ki"("code");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_code_key" ON "org_unit"("code");

-- CreateIndex
CREATE INDEX "org_unit_parent_id_idx" ON "org_unit"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "app_user_org_unit_id_idx" ON "app_user"("org_unit_id");

-- CreateIndex
CREATE INDEX "plan_version_ki_id_sequence_idx" ON "plan_version"("ki_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "plan_version_ki_id_code_key" ON "plan_version"("ki_id", "code");

-- CreateIndex
CREATE INDEX "node_ki_id_level_idx" ON "node"("ki_id", "level");

-- CreateIndex
CREATE INDEX "node_parent_id_idx" ON "node"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "control_item_code_key" ON "control_item"("code");

-- CreateIndex
CREATE INDEX "control_item_node_id_idx" ON "control_item"("node_id");

-- CreateIndex
CREATE INDEX "control_item_dic_org_unit_id_idx" ON "control_item"("dic_org_unit_id");

-- CreateIndex
CREATE INDEX "control_item_responsible_user_id_idx" ON "control_item"("responsible_user_id");

-- CreateIndex
CREATE INDEX "entry_plan_version_id_period_idx" ON "entry"("plan_version_id", "period");

-- CreateIndex
CREATE INDEX "entry_control_item_id_plan_version_id_idx" ON "entry"("control_item_id", "plan_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "entry_control_item_id_period_plan_version_id_key" ON "entry"("control_item_id", "period", "plan_version_id");

-- CreateIndex
CREATE INDEX "entry_audit_entry_id_changed_at_idx" ON "entry_audit"("entry_id", "changed_at");

-- CreateIndex
CREATE INDEX "entry_dependency_target_control_item_id_target_period_targe_idx" ON "entry_dependency"("target_control_item_id", "target_period", "target_plan_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "entry_dependency_dependent_entry_id_target_control_item_id__key" ON "entry_dependency"("dependent_entry_id", "target_control_item_id", "target_period", "target_plan_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_band_symbol_key" ON "evaluation_band"("symbol");

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_version" ADD CONSTRAINT "plan_version_ki_id_fkey" FOREIGN KEY ("ki_id") REFERENCES "ki"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node" ADD CONSTRAINT "node_ki_id_fkey" FOREIGN KEY ("ki_id") REFERENCES "ki"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node" ADD CONSTRAINT "node_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node" ADD CONSTRAINT "node_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_item" ADD CONSTRAINT "control_item_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_item" ADD CONSTRAINT "control_item_dic_org_unit_id_fkey" FOREIGN KEY ("dic_org_unit_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_item" ADD CONSTRAINT "control_item_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_control_item_id_fkey" FOREIGN KEY ("control_item_id") REFERENCES "control_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "plan_version"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry" ADD CONSTRAINT "entry_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_audit" ADD CONSTRAINT "entry_audit_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_audit" ADD CONSTRAINT "entry_audit_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_dependency" ADD CONSTRAINT "entry_dependency_dependent_entry_id_fkey" FOREIGN KEY ("dependent_entry_id") REFERENCES "entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_dependency" ADD CONSTRAINT "entry_dependency_target_control_item_id_fkey" FOREIGN KEY ("target_control_item_id") REFERENCES "control_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
