-- Tenant Identity T2 · organization logos (ADR-0002: "one private, organization-prefixed bucket for logos";
-- Architecture Definition §8 rule 6: "read for bound principals of that organization, write for B10"; 05 §6: a tenant
-- contributes name + logo only — the product's colours, type and components never derive from it).
--   · Bucket `organization-logos`: private, PNG/WebP only, 256 KB per file. Objects live at
--     <organization_id>/<version>/symbol-{32,64,512}.png — versioned paths, so a new logo is a new version, never an
--     overwrite a device could miss.
--   · One Storage policy: a bound device (private.current_org_id(), which is null for an unbound or revoked device)
--     reads its own organization's prefix — nothing else. No insert / update / delete policy: browsers never write
--     (RLS on storage.objects denies by default). Uploads are an operator task (Dashboard / CLI), never the app.
--   · organizations.logo: the versioned reference the device context returns — the version and the presentation
--     geometry of the brand moment (ring colour and size, reveal radius) as tenant data, so no salon's design is
--     built into product code. Null = no logo: the app shows the name only.
--   · Written only by operator procedures (B10, as the other private.admin_*), audited; a version is accepted only
--     when its three files are already stored, so a device never receives a reference to missing files.

alter table public.organizations add column logo jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('organization-logos', 'organization-logos', false, 262144, array['image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy organization_logos_read_own on storage.objects for select to authenticated
  using (bucket_id = 'organization-logos' and (storage.foldername(name))[1] = (select private.current_org_id())::text);

-- The device context also names the organization's current logo (or null).
create or replace function public.device_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object(
       'bound', true,
       'organization', jsonb_build_object(
         'id', o.id, 'name', o.name, 'timezone', o.timezone,
         'currency_code', o.currency_code, 'currency_exponent', o.currency_exponent, 'currency_symbol', o.currency_symbol,
         'logo', o.logo))
     from private.current_device() cd join public.organizations o on o.id = cd.organization_id),
    jsonb_build_object('bound', false))
$$;

create or replace function private.admin_set_organization_logo(p_org uuid, p_version int, p_ring_color text default null,
  p_ring_radius numeric default null, p_ring_width numeric default null, p_iris numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_logo jsonb; v_size int;
begin
  if not exists (select 1 from public.organizations where id = p_org) then raise exception 'NOT_FOUND'; end if;
  if p_version is null or p_version < 1 then raise exception 'VALIDATION_FAILED'; end if;
  -- the ring is all or nothing; every value inside the emblem's own box (fractions of its width)
  if (p_ring_color is null) <> (p_ring_radius is null) or (p_ring_color is null) <> (p_ring_width is null)
     or (p_ring_color is not null and (p_ring_color !~ '^#[0-9A-Fa-f]{6}$' or p_ring_radius <= 0 or p_ring_radius > 0.5 or p_ring_width <= 0 or p_ring_width > 0.1))
     or (p_iris is not null and (p_iris <= 0 or p_iris > 0.71)) then
    raise exception 'VALIDATION_FAILED';
  end if;
  foreach v_size in array array[32, 64, 512] loop
    if not exists (select 1 from storage.objects where bucket_id = 'organization-logos' and name = format('%s/%s/symbol-%s.png', p_org, p_version, v_size)) then
      raise exception 'LOGO_FILES_MISSING';
    end if;
  end loop;
  v_logo := jsonb_build_object('version', p_version)
    || case when p_ring_color is null then '{}'::jsonb
            else jsonb_build_object('ring', jsonb_build_object('color', upper(p_ring_color), 'radius', p_ring_radius, 'width', p_ring_width)) end
    || case when p_iris is null then '{}'::jsonb else jsonb_build_object('iris', p_iris) end;
  update public.organizations set logo = v_logo where id = p_org;
  perform private.audit('organization_logo_set', p_org, p_org, v_logo);
  return v_logo;
end $$;

create or replace function private.admin_clear_organization_logo(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.organizations set logo = null where id = p_org;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform private.audit('organization_logo_cleared', p_org, p_org, '{}'::jsonb);
end $$;

revoke all on function private.admin_set_organization_logo(uuid, int, text, numeric, numeric, numeric), private.admin_clear_organization_logo(uuid)
  from public, anon, authenticated;

-- Self-test: the boundary as declared (catalog), and the operator procedures' rules on a throwaway organization
-- (rolled back; the three file rows are catalog rows only — no file is stored and nothing is kept).
do $$
declare v_org uuid := gen_random_uuid(); v_logo jsonb; v_n int;
begin
  if not exists (select 1 from storage.buckets where id = 'organization-logos' and public = false and file_size_limit = 262144
                   and allowed_mime_types = array['image/png', 'image/webp']) then raise exception 'selftest: bucket'; end if;
  -- the only policy on storage.objects is the read of one's own prefix, for authenticated; none on storage.buckets
  select count(*) into v_n from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects';
  if v_n <> 1 or not exists (select 1 from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects'
       and policyname = 'organization_logos_read_own' and cmd = 'SELECT' and roles = array['authenticated']::name[]) then
    raise exception 'selftest: storage.objects policies (% found)', v_n; end if;
  if exists (select 1 from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'buckets') then raise exception 'selftest: bucket policy'; end if;
  if (select relrowsecurity from pg_catalog.pg_class where oid = 'storage.objects'::regclass) is not true then raise exception 'selftest: objects RLS'; end if;
  if has_function_privilege('authenticated', 'private.admin_set_organization_logo(uuid,integer,text,numeric,numeric,numeric)', 'execute')
     or has_function_privilege('anon', 'private.admin_clear_organization_logo(uuid)', 'execute') then raise exception 'selftest: admin executable'; end if;
  if position('''logo''' in pg_get_functiondef('public.device_context()'::regprocedure)) = 0 then raise exception 'selftest: device_context'; end if;
  begin
    insert into public.organizations (id, name, timezone, currency_code, currency_exponent, currency_symbol) values (v_org, 'selftest', 'UTC', 'XXX', 2, 'X');
    begin
      perform private.admin_set_organization_logo(v_org, 1);
      raise exception 'selftest: accepted a version without files';
    exception when others then if sqlerrm <> 'LOGO_FILES_MISSING' then raise; end if;
    end;
    insert into storage.objects (bucket_id, name) select 'organization-logos', format('%s/1/symbol-%s.png', v_org, s) from unnest(array[32, 64, 512]) s;
    begin
      perform private.admin_set_organization_logo(v_org, 1, '#39783f', 0.393);           -- half a ring
      raise exception 'selftest: accepted a partial ring';
    exception when others then if sqlerrm <> 'VALIDATION_FAILED' then raise; end if;
    end;
    v_logo := private.admin_set_organization_logo(v_org, 1, '#39783f', 0.393, 0.032, 0.415);
    if v_logo <> '{"version": 1, "ring": {"color": "#39783F", "radius": 0.393, "width": 0.032}, "iris": 0.415}'::jsonb
       or (select logo from public.organizations where id = v_org) <> v_logo then raise exception 'selftest: logo %', v_logo; end if;
    if not exists (select 1 from private.security_audit where action = 'organization_logo_set' and organization_id = v_org) then raise exception 'selftest: audit'; end if;
    perform private.admin_clear_organization_logo(v_org);
    if (select logo from public.organizations where id = v_org) is not null then raise exception 'selftest: clear'; end if;
    raise exception 'selftest_ok';
  exception when others then
    if sqlerrm <> 'selftest_ok' then raise; end if;
  end;
end $$;
