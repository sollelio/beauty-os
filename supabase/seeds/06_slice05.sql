-- Slice 05 synthetic development data (Salão Demo only): a few more products, past purchases (Agosto/Setembro) so
-- "última compra" and the product history have context, and human-set Stock states. Not pilot data.
-- Test organizations keep their defaults (OK, not on the list); tests set states themselves.

insert into public.products (id, organization_id, name, unit_word) values
  ('00000000-0000-4000-8000-00000000d606', '00000000-0000-4000-8000-000000000d01', 'Condicionador 5 L',  'garrafão'),
  ('00000000-0000-4000-8000-00000000d607', '00000000-0000-4000-8000-000000000d01', 'Tinta preta',        'tubo'),
  ('00000000-0000-4000-8000-00000000d608', '00000000-0000-4000-8000-000000000d01', 'Tratamento capilar', 'frasco')
on conflict do nothing;

insert into public.purchases (id, organization_id, total_minor, origin_id, occurred_at, recorded_at, device_id, confirmed_by_person_id, command_id) values
  ('00000000-0000-4000-8000-0000000c5001', '00000000-0000-4000-8000-000000000d01', 2650000, '00000000-0000-4000-8000-00000000d501', '2026-08-10 11:00+01', '2026-08-10 11:00+01', '00000000-0000-4000-8000-0000000cdede', '00000000-0000-4000-8000-00000000d204', '00000000-0000-4000-8000-0000000c5101'),
  ('00000000-0000-4000-8000-0000000c5002', '00000000-0000-4000-8000-000000000d01', 2650000, '00000000-0000-4000-8000-00000000d501', '2026-09-12 11:00+01', '2026-09-12 11:00+01', '00000000-0000-4000-8000-0000000cdede', '00000000-0000-4000-8000-00000000d204', '00000000-0000-4000-8000-0000000c5102'),
  ('00000000-0000-4000-8000-0000000c5003', '00000000-0000-4000-8000-000000000d01', 1000000, '00000000-0000-4000-8000-00000000d502', '2026-09-28 16:00+01', '2026-09-28 16:00+01', '00000000-0000-4000-8000-0000000cdede', '00000000-0000-4000-8000-00000000d204', '00000000-0000-4000-8000-0000000c5103')
on conflict do nothing;
insert into public.purchase_lines (purchase_id, organization_id, product_id, quantity, unit_word, line_cost_minor, position) values
  ('00000000-0000-4000-8000-0000000c5001', '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d606', 2, 'garrafão', 1300000, 1),
  ('00000000-0000-4000-8000-0000000c5001', '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d601', 2, 'garrafão', 1350000, 2),
  ('00000000-0000-4000-8000-0000000c5002', '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d601', 2, 'garrafão', 1400000, 1),
  ('00000000-0000-4000-8000-0000000c5002', '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d607', 2, 'tubo',     1250000, 2),
  ('00000000-0000-4000-8000-0000000c5003', '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d602', 3, 'frasco',    750000, 1),
  ('00000000-0000-4000-8000-0000000c5003', '00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-00000000d604', 1, 'caixa',     250000, 2)
on conflict do nothing;
insert into public.purchase_contributions (purchase_id, organization_id, contributor_kind, person_id, amount_minor) values
  ('00000000-0000-4000-8000-0000000c5001', '00000000-0000-4000-8000-000000000d01', 'salon', null, 2650000),
  ('00000000-0000-4000-8000-0000000c5002', '00000000-0000-4000-8000-000000000d01', 'salon', null, 2650000),
  ('00000000-0000-4000-8000-0000000c5003', '00000000-0000-4000-8000-000000000d01', 'salon', null, 1000000)
on conflict do nothing;

-- Human-set states (as a person would set them), then the mark dates of the sample.
update public.products set purpose = 'Cabelo', state = 'comprar', level = 'quase_vazio', on_list = true where id = '00000000-0000-4000-8000-00000000d601';
update public.products set purpose = 'Unhas',  state = 'comprar', level = 'quase_vazio', on_list = true where id = '00000000-0000-4000-8000-00000000d602';
update public.products set state = 'comprar', level = 'vazio', urgent = true where id = '00000000-0000-4000-8000-00000000d604';
update public.products set purpose = 'Cabelo', state = 'baixo', level = 'metade', reserve_units = 1 where id = '00000000-0000-4000-8000-00000000d606';
update public.products set purpose = 'Cabelo', state = 'baixo', level = 'metade' where id = '00000000-0000-4000-8000-00000000d607';
update public.products set level = 'cheio', reserve_units = 1 where id = '00000000-0000-4000-8000-00000000d603';
update public.products set reserve_units = 4 where id = '00000000-0000-4000-8000-00000000d605';
update public.products set purpose = 'Cabelo', level = 'cheio' where id = '00000000-0000-4000-8000-00000000d608';
update public.products set marked_at = '2026-10-04 10:00+01' where id = '00000000-0000-4000-8000-00000000d606';
update public.products set marked_at = '2026-10-01 10:00+01' where id in ('00000000-0000-4000-8000-00000000d601', '00000000-0000-4000-8000-00000000d602');
