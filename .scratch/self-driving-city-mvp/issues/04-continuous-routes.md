# 04: Непрерывные поездки по маршрутам

Status: resolved
Blocked by: 02

**What to build:** Посетитель видит, как автономная машина циклически проходит вручную заданные достижимые демонстрационные маршруты и после прибытия начинает следующий без сброса мира.

- [x] Небольшая карта содержит несколько соединённых перекрёстков; каждый вручную заданный маршрут проверяется на связность дорог.
- [x] Маршрут виден контрастной линией поверх дороги и обновляется при выборе следующего маршрута цикла.
- [x] Автономная машина плавно следует маршруту и проходит повороты без движения сквозь здания или вне дороги.
- [x] После прибытия включается следующий маршрут; воспроизводимый заезд завершает несколько поездок без перезагрузки и скрытой телепортации.
- [x] Проверка проходит через наблюдаемое прибытие и смену маршрута в фиксированном цикле.

## Answer

Implemented and verified with the deterministic continuous-routes scenario. The public loop has exactly four curated routes, rather than random destinations or runtime graph search, so red/green and opposite pedestrian crossings are always demonstrated. New road events require paired route variants, checks and TypeScript-generated training examples.
