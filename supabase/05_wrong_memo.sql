-- 오답노트 학생 메모(내가 쓴 오답 정리) 저장
alter table public.wrong_notes add column if not exists memo text;

create or replace function public.set_wrong_note_memo(p_id bigint, p_memo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.wrong_notes set memo = nullif(trim(p_memo), '') where id = p_id and student_id = auth.uid();
end;
$$;
grant execute on function public.set_wrong_note_memo(bigint, text) to authenticated;

select 'wrong memo ready' as result;
