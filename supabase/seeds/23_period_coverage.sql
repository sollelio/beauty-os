-- Slice 4 · operational records need a covering period (NO_PERIOD_FOR_DATE otherwise). Synthetic, not pilot data.
-- Test organizations whose tests record "now" get one long covering period from the day after their last period (or
-- before their first record) to the end of 2027, like the other test organizations. Nothing overlaps an existing period.
--   Teste Isolamento A (monthly periods to 2026-10-31) · Teste Isolamento B (to 2026-09-30) · Teste Catálogo G (no period;
--   the same period as seed 17) · Teste Inativo I (no period) · Teste Pessoas (one period in January 2026)
insert into public.periods (id, organization_id, label, starts_on, ends_on) values
  ('00000000-0000-4000-8000-00000000c0a1', '00000000-0000-4000-8000-0000000000a1', 'Cobertura Teste A', '2026-11-01', '2027-12-31'),
  ('00000000-0000-4000-8000-00000000c0b1', '00000000-0000-4000-8000-0000000000b1', 'Cobertura Teste B', '2026-10-01', '2027-12-31'),
  ('00000000-0000-4000-8000-00000000c0f5', '00000000-0000-4000-8000-0000000000f5', 'Cobertura Teste G', '2026-01-05', '2027-12-31'),
  ('00000000-0000-4000-8000-00000000c0fa', '00000000-0000-4000-8000-0000000000fa', 'Cobertura Teste I', '2026-10-01', '2027-12-31'),
  ('00000000-0000-4000-8000-00000000c0fb', '00000000-0000-4000-8000-0000000000fb', 'Cobertura Teste Pessoas', '2026-01-12', '2027-12-31')
on conflict (id) do nothing;
