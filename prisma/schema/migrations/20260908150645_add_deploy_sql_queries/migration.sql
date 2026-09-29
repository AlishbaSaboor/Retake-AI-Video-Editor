-- CreateTable
CREATE TABLE "_run_once_sql" (
    "hash" TEXT NOT NULL,
    "sql" TEXT NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_run_once_sql_pkey" PRIMARY KEY ("hash")
);
