-- Slice 3 (Sollelio, 2026-10-26) · operational attribution is personnel only. A person recorded as the professional of a
-- service, the recipient of an advance or a contributor to a purchase works in the salon: a support identity
-- (people.kind 'support', 20261028000100) is refused server-side (PERSON_NOT_PERSONNEL) — whatever the client sends,
-- online or as an offline draft. Checked at each command's existing person validation (right after PERSON_INACTIVE),
-- before any one-shot grant is consumed and before anything is written. This is not an authorization: the support
-- identity keeps its permissions, its PIN and its verification; it may still confirm (verified actor) what its permissions
-- allow — it only cannot be the salon person a business record is about.
do $$
declare v_src text; v_a text := $a$    raise exception 'PERSON_INACTIVE';
  end if;$a$; v_fn text; v_check text;
begin
  foreach v_fn in array array['public.record_service(uuid,uuid,uuid,bigint,jsonb,uuid,timestamptz)',
                              'public.record_advance(uuid,uuid,uuid,bigint,uuid,text,uuid,timestamptz)',
                              'public.record_purchase(uuid,uuid,jsonb,bigint,jsonb,uuid,uuid,timestamptz)'] loop
    v_src := pg_get_functiondef(v_fn::regprocedure);
    if (length(v_src) - length(replace(v_src, v_a, ''))) / length(v_a) <> 1 then raise exception 'personnel patch: % anchor not found once', v_fn; end if;
    v_check := case when v_fn like 'public.record_purchase%' then
      $c$
  if exists (select 1 from jsonb_array_elements(v_contribs) c
              where not exists (select 1 from public.people p where p.id = (c ->> 'person_id')::uuid and p.kind = 'personnel')) then
    raise exception 'PERSON_NOT_PERSONNEL';                  -- a contributor is salon personnel, never a support identity
  end if;$c$
    else
      $c$
  if not exists (select 1 from public.people p where p.id = p_person_id and p.kind = 'personnel') then
    raise exception 'PERSON_NOT_PERSONNEL';                  -- the professional / recipient is salon personnel, never a support identity
  end if;$c$
    end;
    execute replace(v_src, v_a, v_a || v_check);
    if position('PERSON_NOT_PERSONNEL' in pg_get_functiondef(v_fn::regprocedure)) = 0 then raise exception 'personnel patch failed: %', v_fn; end if;
  end loop;
end $$;
