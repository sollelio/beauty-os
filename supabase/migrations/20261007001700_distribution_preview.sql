-- Slice 06 F8: the owners' decision sheet previews "Não distribuído" for the amount being typed. Previews are
-- read-only database queries over the same calculation (ADR-0004); nothing is recorded.
create or replace function public.fecho_distribution_preview(p_period_id uuid, p_kind text, p_amount_minor bigint default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := private.current_org_id(); v_viewer uuid := private.require_finance_viewer();
  v_period public.periods := private.resolve_period(p_period_id); v_pos jsonb; v_dist bigint;
begin
  if p_kind not in ('none', 'amount') or (p_kind = 'amount' and coalesce(p_amount_minor, 0) < 0) then raise exception 'VALIDATION_FAILED'; end if;
  v_pos := private.period_position(v_org, v_period);
  v_dist := case when p_kind = 'amount' then coalesce(p_amount_minor, 0) else 0 end;
  return jsonb_build_object('livre_minor', v_pos -> 'livre_minor', 'distribution_minor', v_dist,
    'undistributed_minor', case when v_pos ->> 'livre_minor' is not null then (v_pos ->> 'livre_minor')::bigint - v_dist end);
end $$;
revoke all on function public.fecho_distribution_preview(uuid, text, bigint) from public, anon;
grant execute on function public.fecho_distribution_preview(uuid, text, bigint) to authenticated;
