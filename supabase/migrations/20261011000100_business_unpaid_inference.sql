-- Business Health · Slice 05 privacy follow-up (07 D9 · B11): the approved-and-unpaid total is not an inference path.
--
-- Team earnings − unpaid = advances + paid of the people in the approval. For a viewer without team.finance.read,
-- where the team earnings are visible and the people who were paid or had an advance resolve to exactly one person
-- other than the viewer (the viewer's own amounts are known to them), "A pagar à equipa" is hidden for that period;
-- "Pago à equipa" follows it (existing rule). Two or more such others stay an aggregate: no individual amount follows.
-- business_redact runs in every Business Health read (overview, open periods and their insight, comparison, averages,
-- trend), so the hidden total reaches none of them. Only business_redact changes.

create or replace function private.business_redact(p_m jsonb, p_finance boolean, p_viewer uuid)
returns jsonb language plpgsql immutable as $$
declare v_hide text[] := '{}'; v_k text; v_out jsonb;
begin
  if p_m is null then return null; end if;
  if not p_finance then
    if private.business_one_other(p_m -> '_earners', p_viewer) then
      v_hide := v_hide || array['team_earnings_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'];
    end if;
    if private.business_one_other(p_m -> '_owed', p_viewer) then
      v_hide := v_hide || array['unpaid_team_minor'];
    end if;
    -- team earnings − unpaid = advances + paid: hidden where those resolve to one person other than the viewer
    if not 'team_earnings_minor' = any (v_hide)
       and private.business_one_other(coalesce(p_m -> '_paid', '[]'::jsonb) || coalesce(p_m -> '_advanced', '[]'::jsonb), p_viewer) then
      v_hide := v_hide || array['unpaid_team_minor'];
    end if;
    -- salon-funded purchases = purchase total − personal contributions; with line costs on the shared Stock screen,
    -- they give the contributions, so they (and every figure that contains them) are hidden where those resolve to
    -- one person other than the viewer
    if private.business_one_other(p_m -> '_contributors', p_viewer) then
      v_hide := v_hide || array['purchases_salon_minor', 'operating_costs_minor', 'operating_result_minor', 'retention_pct', 'free_minor'];
    end if;
    -- Resultado − Livre − alocado + usado = the team's amount above earnings (Slice 05)
    if private.business_one_other(p_m -> '_excess', p_viewer) then
      v_hide := v_hide || array['free_minor'];
    end if;
    -- paid + unpaid = team earnings − advances (Slice 05)
    if private.business_one_other(p_m -> '_paid', p_viewer) or private.business_one_other(p_m -> '_advanced', p_viewer) then
      v_hide := v_hide || array['paid_team_minor'];
    end if;
    if 'unpaid_team_minor' = any (v_hide) or 'team_earnings_minor' = any (v_hide) then v_hide := v_hide || array['paid_team_minor']; end if;
    if 'free_minor' = any (v_hide) then v_hide := v_hide || array['undistributed_minor']; end if;   -- Livre − the owners' decision
  end if;
  v_out := p_m - '_earners' - '_owed' - '_contributors' - '_paid' - '_advanced' - '_excess';
  -- only a figure that exists is hidden; one that is undefined (a rule pending) stays undefined
  v_hide := array(select k from unnest(v_hide) with ordinality t(k, n) where v_out ->> k is not null group by k order by min(n));
  foreach v_k in array v_hide loop v_out := v_out || jsonb_build_object(v_k, null); end loop;
  return v_out || jsonb_build_object('private_fields', to_jsonb(v_hide));
end $$;
