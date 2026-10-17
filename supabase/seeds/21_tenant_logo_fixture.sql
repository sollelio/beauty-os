-- Tenant Identity T2 · logo references for the synthetic test organizations (Dev only; tests/db/tenant_logos.test.ts).
-- Not pilot data, never in production. Run only after the operator has uploaded the six fixture files (neutral grey
-- squares, not logos) to the private bucket:
--   organization-logos/00000000-0000-4000-8000-0000000000a1/1/symbol-{32,64,512}.png   (Teste Isolamento A)
--   organization-logos/00000000-0000-4000-8000-0000000000b1/1/symbol-{32,64,512}.png   (Teste Isolamento B)
-- The procedure refuses a version whose files are not stored (LOGO_FILES_MISSING), so this fails safely otherwise.
-- A carries ring geometry (to exercise the drawn ring); B has none (the plain reveal).
select private.admin_set_organization_logo('00000000-0000-4000-8000-0000000000a1', 1, '#5B5F68', 0.45, 0.03, 0.5);
select private.admin_set_organization_logo('00000000-0000-4000-8000-0000000000b1', 1);
