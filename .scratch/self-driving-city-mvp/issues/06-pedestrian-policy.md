# 06: Пешеход и действие модели

Status: resolved
Blocked by: 05

**What to build:** Посетитель видит пешехода на переходе и автономную машину, которая по действию модели уступает ему дорогу и затем продолжает поездку. Обучение расширяется на эту ситуацию, сохраняя работу у светофора.

- [x] Пешеход и переход видны; переходящий пешеход появляется в воспроизводимом сценарии.
- [x] Наблюдение отражает положение и движение пешехода в конфликтующей зоне; учитель создаёт примеры уступания, а модель обучается вместе с уже поддерживаемым светофором.
- [x] В отложенном сценарии модель останавливает автономную машину перед занятым переходом и возобновляет движение после освобождения перехода без защитного вмешательства.
- [x] Защита предотвращает непосредственное столкновение при ошибке модели и явно отмечает своё вмешательство.
- [x] Проверка подтверждает, что новая модель по-прежнему правильно реагирует на красный и разрешающий сигналы.

## Answer

Implemented and verified with deterministic pedestrian scenarios, version 3 observation contract, retrained published ONNX model, and explicit pedestrian safety event. The curated loop contains paired eastbound and westbound pedestrian crossings on route-local clocks; future road events need the same paired routes, checks and TypeScript-generated training coverage. Passed `typecheck`, `lint`, simulator, traffic-light and pedestrian policy checks, Python model check, production build and `git diff --check`.
