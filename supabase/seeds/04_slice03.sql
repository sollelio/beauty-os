-- Synthetic development data for Slice 03: expense categories, purchase origins, unit words, products. Idempotent.
-- These lists are organization configuration (03 §5, 07 §10.7), seeded here because configuration UIs are not built.

insert into public.expense_categories (id, organization_id, label, hint, sort_order) values
  ('00000000-0000-4000-8000-00000000d401', '00000000-0000-4000-8000-000000000d01', 'Água',          'Conta da água',              1),
  ('00000000-0000-4000-8000-00000000d402', '00000000-0000-4000-8000-000000000d01', 'Electricidade', 'Conta da luz',               2),
  ('00000000-0000-4000-8000-00000000d403', '00000000-0000-4000-8000-000000000d01', 'Renda',         'Renda do espaço',            3),
  ('00000000-0000-4000-8000-00000000d404', '00000000-0000-4000-8000-000000000d01', 'Manutenção',    'Reparações e arranjos',      4),
  ('00000000-0000-4000-8000-00000000d405', '00000000-0000-4000-8000-000000000d01', 'Outros',        'Outros gastos do salão',     5),
  ('00000000-0000-4000-8000-00000000a401', '00000000-0000-4000-8000-0000000000a1', 'Despesa Teste A', null, 1),
  ('00000000-0000-4000-8000-00000000b401', '00000000-0000-4000-8000-0000000000b1', 'Despesa Teste B', null, 1)
on conflict (id) do nothing;

insert into public.purchase_origins (id, organization_id, label, sort_order) values
  ('00000000-0000-4000-8000-00000000d501', '00000000-0000-4000-8000-000000000d01', 'Mercado',    1),
  ('00000000-0000-4000-8000-00000000d502', '00000000-0000-4000-8000-000000000d01', 'Loja local', 2),
  ('00000000-0000-4000-8000-00000000d503', '00000000-0000-4000-8000-000000000d01', 'Outro',      3),
  ('00000000-0000-4000-8000-00000000a501', '00000000-0000-4000-8000-0000000000a1', 'Mercado',    1),
  ('00000000-0000-4000-8000-00000000b501', '00000000-0000-4000-8000-0000000000b1', 'Mercado',    1)
on conflict (id) do nothing;

insert into public.unit_words (organization_id, word, sort_order)
select o.id, w.word, w.ord
from (values ('00000000-0000-4000-8000-000000000d01'::uuid), ('00000000-0000-4000-8000-0000000000a1'::uuid), ('00000000-0000-4000-8000-0000000000b1'::uuid)) o(id)
cross join (values ('unid.', 1), ('frasco', 2), ('garrafão', 3), ('caixa', 4), ('tubo', 5), ('pacote', 6)) w(word, ord)
on conflict do nothing;

insert into public.products (id, organization_id, name, unit_word) values
  ('00000000-0000-4000-8000-00000000d601', '00000000-0000-4000-8000-000000000d01', 'Shampoo 5 L',       'garrafão'),
  ('00000000-0000-4000-8000-00000000d602', '00000000-0000-4000-8000-000000000d01', 'Gel para unhas',    'frasco'),
  ('00000000-0000-4000-8000-00000000d603', '00000000-0000-4000-8000-000000000d01', 'Acetona',           'frasco'),
  ('00000000-0000-4000-8000-00000000d604', '00000000-0000-4000-8000-000000000d01', 'Lâminas',           'caixa'),
  ('00000000-0000-4000-8000-00000000d605', '00000000-0000-4000-8000-000000000d01', 'Toalhas',           'unid.'),
  ('00000000-0000-4000-8000-00000000a601', '00000000-0000-4000-8000-0000000000a1', 'Produto Teste A',   'frasco'),
  ('00000000-0000-4000-8000-00000000b601', '00000000-0000-4000-8000-0000000000b1', 'Produto Teste B',   'frasco')
on conflict (id) do nothing;
