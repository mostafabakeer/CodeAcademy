-- فحص سريع (SELECT فقط) يتأكد أن ميجريشن 016 طُبّق فعلاً وأن الدوال ترجع صفوفاً.
select jsonb_pretty(jsonb_build_object(
  'functions', (
    select jsonb_object_agg(p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'exam_top3_leaderboards',
        'latest_exam_rank',
        'admin_dashboard_stats',
        'password_reset_diagnostics'
      )
  ),
  'indexes', (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'idx_users_username',
        'idx_notes_grade',
        'idx_exams_created_id',
        'idx_exam_results_exam_best_user',
        'idx_password_resets_status',
        'idx_password_resets_created'
      )
  ),
  'service_role_can_execute', jsonb_build_object(
    'exam_top3_leaderboards', has_function_privilege('service_role', 'public.exam_top3_leaderboards(integer)', 'execute'),
    'latest_exam_rank', has_function_privilege('service_role', 'public.latest_exam_rank(bigint,text)', 'execute'),
    'admin_dashboard_stats', has_function_privilege('service_role', 'public.admin_dashboard_stats()', 'execute'),
    'password_reset_diagnostics', has_function_privilege('service_role', 'public.password_reset_diagnostics(text)', 'execute')
  ),
  'anon_can_execute', has_function_privilege('anon', 'public.admin_dashboard_stats()', 'execute'),
  'top3_rows', (select count(*) from public.exam_top3_leaderboards(30)),
  'rank_rows', (select count(*) from public.latest_exam_rank(1, 'bac1')),
  'admin_stats', (select to_jsonb(s) from public.admin_dashboard_stats() s),
  'diagnostics', (select to_jsonb(d) from public.password_reset_diagnostics(null) d)
)) as result;
