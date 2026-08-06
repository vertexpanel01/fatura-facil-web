revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.bootstrap_admin(uuid) from public, anon;
revoke execute on function public.importar_faturas_lote(jsonb, date) from public, anon;
revoke execute on function private.has_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.bootstrap_admin(uuid) to authenticated;
grant execute on function public.importar_faturas_lote(jsonb, date) to authenticated;
