-- 학생 학년에 중/고 구분 추가 (level: '중' | '고', grade: 1~3)
alter table public.profiles add column if not exists level text not null default '중' check (level in ('중','고'));
update public.profiles p set level = pub.level from public.publishers pub where p.publisher_id = pub.id and pub.level = '고' and p.level <> '고';
select 'profile level ready' as result;
