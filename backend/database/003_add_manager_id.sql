-- Adds reporting-structure columns to employees.
-- Safe to re-run and safe in environments where public.employees does not exist.
DO $$
BEGIN
    IF to_regclass('public.employees') IS NULL THEN
        RAISE NOTICE 'Skipping manager hierarchy migration: public.employees does not exist.';
        RETURN;
    END IF;

    ALTER TABLE public.employees
      ADD COLUMN IF NOT EXISTS manager_id TEXT;

    ALTER TABLE public.employees
      ADD COLUMN IF NOT EXISTS org_level INT DEFAULT 3; -- 1=C-Suite, 2=VP/Director, 3=Manager, 4=IC

    CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON public.employees(manager_id);
    CREATE INDEX IF NOT EXISTS idx_employees_org_level ON public.employees(org_level);
END
$$;
