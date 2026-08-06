create or replace function public.bootstrap_admin(_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  has_admin boolean;
begin
  select exists (
    select 1 from public.user_roles where role = 'admin'
  ) into has_admin;

  if has_admin then
    return false;
  end if;

  insert into public.user_roles (user_id, role)
  values (_user_id, 'admin')
  on conflict (user_id, role) do nothing;

  return true;
end;
$$;

grant execute on function public.bootstrap_admin(uuid) to authenticated;
grant execute on function public.handle_new_user() to authenticated;
