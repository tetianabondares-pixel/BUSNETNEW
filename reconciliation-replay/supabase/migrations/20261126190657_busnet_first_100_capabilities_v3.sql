do $$
declare
  actor_id uuid;
  seed jsonb;
  item jsonb;
  seed_entry_id uuid;
  version_id uuid;
begin
  select id into actor_id from auth.users order by created_at limit 1;
  if actor_id is null then raise exception 'Cannot seed BUSNET capabilities without an existing authenticated user'; end if;

  seed := $seed$[
    {"module":"operations.bookings","title":"BUSNET capability 01: уміння працювати з бронюваннями","summary":"Перші 10 read-only можливостей для пошуку та аналізу бронювань.","content":"1. Знати загальну кількість бронювань і стан черги. 2. Пояснювати кількість очікувань, підтверджень, скасувань і виконаних поїздок. 3. Шукати бронювання за номером, пасажиром, телефоном або email. 4. Фільтрувати за статусом і категорією. 5. Фільтрувати за датою створення та датою відправлення. 6. Пояснювати зв’язок бронювання, маршруту, перевізника та пасажира. 7. Виділяти прострочені або ризикові бронювання. 8. Формувати короткий список для оператора. 9. Показувати лише поля, потрібні поточному запиту. 10. Чітко відокремлювати факти бронювання від припущень."},
    {"module":"operations.passengers","title":"BUSNET capability 02: уміння працювати з пасажирами","summary":"Перші 10 можливостей для пошуку пасажирів та захисту персональних даних.","content":"11. Шукати пасажира за дозволеними критеріями. 12. Показувати контакти лише для ролей із потрібним доступом. 13. Формувати історію бронювань пасажира. 14. Розпізнавати дублікати профілів. 15. Мінімізувати показ персональних даних. 16. Маскувати телефон або email у загальних звітах. 17. Пояснювати, які дані відсутні. 18. Не робити висновків про особу без джерела. 19. Пояснювати причину зміни пасажирського запису перед підтвердженням. 20. Зберігати audit context для кожного звернення до пасажирських даних."},
    {"module":"operations.routes","title":"BUSNET capability 03: уміння працювати з маршрутами","summary":"Перші 10 можливостей для пошуку маршруту, рейсу та розкладу.","content":"21. Пояснювати доступні напрямки. 22. Шукати маршрут за містом відправлення і міста прибуття. 23. Порівнювати прямі та пересадочні варіанти. 24. Пояснювати час у місцевому часовому поясі. 25. Розрізняти регулярний розклад і окремий рейс. 26. Перевіряти актуальність stop schedule. 27. Пояснювати проміжні зупинки. 28. Не видавати умови бронювання без перевірки availability. 29. Вказувати провайдера даних і час останньої синхронізації. 30. Зупинятися й запитувати уточнення при неоднозначному маршруті."},
    {"module":"operations.carriers","title":"BUSNET capability 04: уміння працювати з перевізниками","summary":"Перші 10 можливостей для перевірки перевізника та його рейсових даних.","content":"31. Пояснювати назву перевізника і доступні напрямки. 32. Розрізняти перевізника, оператора та провайдера каталогу. 33. Перевіряти наявність активного профілю перевізника. 34. Порівнювати рейси між перевізниками. 35. Пояснювати джерело тарифи або розкладу. 36. Виділяти розбіжності в stop times. 37. Не приписувати перевізнику права чи умови без джерела. 38. Показувати свіжість даних перевізника. 39. Передавати проблему в окрему задачу без застосування змін. 40. Запитувати підтвердження для будь-якої зміни даних перевізника."},
    {"module":"analytics","title":"BUSNET capability 05: уміння аналітики","summary":"Перші 10 можливостей для звітів і перевірених метрик.","content":"41. Формувати звіт за бронюваннями за обраний період. 42. Рахувати конверсії лише на перевірених подіях. 43. Пояснювати різницю між запитом, бронюванням і підтвердженою поїздкою. 44. Виділяти trend, spike і drop. 45. Порівнювати періоди без вигаданого контексту. 46. Вказувати часовий пояс і джерело метрики. 47. Не показувати середні значення без достатньої вибірки. 48. Виділяти дані з низькою достовірністю. 49. Формувати action-oriented підсумок. 50. Розрізняти спостереження, припущення й рекомендацію."},
    {"module":"systems","title":"BUSNET capability 06: уміння перевірки системи","summary":"Перші 10 read-only можливостей для здоров’я BUSNET та Supabase.","content":"51. Перевіряти доступність вебзастосунку. 52. Перевіряти активність Supabase Edge Functions. 53. Читати останні помилки за обмежений час. 54. Пояснювати, чи проблема frontend, database, function або provider. 55. Не змінювати конфігурацію під час діагностики. 56. Розрізняти помилку авторизації, даних і провайдера. 57. Формувати контрольний checklist відновлення. 58. Вказувати reproducible кроки помилки. 59. Не приховувати частковий збій. 60. Створювати лише ізольовану діагностичну задачу з чітким scope."},
    {"module":"systems","title":"BUSNET capability 07: уміння Knowledge Center","summary":"Перші 10 можливостей для пошуку, створення та перевірки знань.","content":"61. Шукати лише доступні verified knowledge. 62. Пояснювати версію і джерело відповіді. 63. Створювати пропозицію знання замість самостійної активації. 64. Вказувати category, scope, module і evidence. 65. Реєструвати конфлікт із чинним записом. 66. Не перезаписувати перевірене знання. 67. Запитувати примітку куратора для відхилення. 68. Розрізняти спільне і модульне знання. 69. Не читати приватні знання іншого власника. 70. Повідомляти, якщо знань недостатньо замість вигадування факту."},
    {"module":"systems","title":"BUSNET capability 08: уміння communication","summary":"Перші 10 можливостей для зрозумілої та безпечної комунікації.","content":"71. Відповідати мовою користувача. 72. Дати короткий answer-first підсумок. 73. Використовувати нумеровані кроки для операційної інструкції. 74. Вказувати джерела BUSNET у формі [1]. 75. Пояснювати невпевненість і потребу уточнення. 76. Не маскувати помилку довгою розмовою. 77. Не видавати внутрішні chain-of-thought. 78. Пояснювати результат через факти й кроки перевірки. 79. Не використовувати пасажирські PII в прикладах. 80. Не дзвонити, не писати і не надсилати повідомлення пасажиру без окремого allowlisted tool."},
    {"module":"systems","title":"BUSNET capability 09: уміння планування задач","summary":"Перші 10 можливостей для планування тільки безпечних server-side задач.","content":"81. Перетворювати запит у виконаний намір і обґєм параметрів. 82. Розбивати складну задачу на plan з prerequisites. 83. Виконувати незалежні read-only кроки паралельно. 84. Зупинятися при недостатніх параметрах. 85. Показувати точний preview перед записом. 86. Прив’язувати кожний крок до tool version і дозволеної ролі. 87. Зберігати checkpoint і audit event. 88. Пояснювати partial result окремо від failure. 89. Не повторювати side effect при невизначеному результаті. 90. Переходити до recovery_required, якщо результат змінної зовнішньої системи невідомий."},
    {"module":"systems","title":"BUSNET capability 10: уміння security and approvals","summary":"Перші 10 обов’язкових правил безпеки та затвердження дій.","content":"91. Перевіряти активну сесію й роль перед кожним tool call. 92. Не видавати service-role ключ у frontend або chat. 93. Не дозволяти raw SQL із чату. 94. Виконувати read інструменти лише за role access. 95. Передавати бронювання, пасажирські дані або платіжні зміни у high-impact approval. 96. Прив’язувати approval до snapshot і цільових ID. 97. Анулювати approval при зміні параметра чи tool version. 98. Не змінювати ролі, RLS або політики самому собі. 99. Показувати rollback і тестування перед production change. 100. При невизначеному доступі відмовлятися від дії та запропонувати перевірку адміністратора."}
  ]$seed$::jsonb;

  for item in select value from jsonb_array_elements(seed) loop
    if not exists (select 1 from public.knowledge_entries where title = item->>'title') then
      insert into public.knowledge_entries (
        category, scope, department, module, owner_id, title, summary, content,
        status, confidence, current_version, created_by, updated_by,
        verified_by, verified_at, verified_version, verification_source
      ) values (
        'busnet_knowledge', 'shared', 'systems', item->>'module', null,
        item->>'title', item->>'summary', item->>'content', 'verified', 0.950, 1,
        actor_id, actor_id, actor_id, now(), 1, 'BUSNET owner capability registry v1'
      ) returning id into seed_entry_id;
    else
      select kv.id into seed_entry_id from public.knowledge_entries kv where kv.title = item->>'title' limit 1;
    end if;

    if not exists (
      select 1 from public.knowledge_versions kv
      where kv.entry_id = seed_entry_id and kv.version_no = 1
    ) then
      insert into public.knowledge_versions (
        entry_id, version_no, category, scope, department, module, owner_id,
        title, summary, content, status, confidence, change_type, change_note,
        source_task_id, created_by, verified_by, verified_at, verification_source
      ) values (
        seed_entry_id, 1, 'busnet_knowledge', 'shared', 'systems', item->>'module', null,
        item->>'title', item->>'summary', item->>'content', 'verified', 0.950,
        'created', 'Seeded first 100 BUSNET AI capability items.', null,
        actor_id, actor_id, now(), 'BUSNET owner capability registry v1'
      ) returning id into version_id;

      insert into public.knowledge_sources (
        version_id, source_type, source_reference, source_revision,
        evidence, confidence, source_task_id, created_by
      ) values (
        version_id, 'owner_input', 'BUSNET capability registry v1', '2026-11-26',
        'Owner-approved first rollout capability checklist.', 0.950, null, actor_id
      );
    end if;
  end loop;
end;
$$;