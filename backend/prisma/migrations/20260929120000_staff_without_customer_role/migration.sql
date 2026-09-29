-- Staff accounts are for the admin workspace only. The auth.users trigger gives
-- every new account the customer role, so drop it from accounts that hold a staff role.
delete from public.user_roles as customer_role
where customer_role.role = 'customer'::public.app_role
  and exists (
    select 1
    from public.user_roles as staff_role
    where staff_role.user_id = customer_role.user_id
      and staff_role.role <> 'customer'::public.app_role
  );
