# Assistive Biometrics Collector Roadmap

Локальный план развития текущего `camera-control-app`: собрать максимум полезных сигналов из камеры и микрофона, потом поверх них построить понятный ассистивный интерфейс для ребенка и взрослого.

Это не медицинская диагностика и не автоматическое принятие решений. Все выводы ниже должны быть гипотезами с `confidence`, `evidence` и подтверждением взрослого.

## 1. Принципы безопасности

- Local-first: видео, аудио и биометрия обрабатываются в браузере.
- Raw stream не хранится по умолчанию: поток пришел, обработался, ушел.
- Снапшоты и записи делает только пользователь явной кнопкой.
- Не хранить "хеш биометрии" как способ авторизации. Биометрические шаблоны шумные и все равно чувствительные.
- Для "только своим сможет воспользоваться" использовать WebAuthn/passkey: браузер/устройство проверяет Face ID, Touch ID или платформенный ключ, а приложение хранит только credential id/public key.
- Любой датасет для обучения должен иметь явную разметку, возможность удаления и отдельный экспорт/импорт.

## 2. Уже собираемые компоненты

- Video stream: камера, FPS камеры, FPS рендера, разрешение, поворот, aspect ratio, fit.
- Frame quality: яркость и резкость кадра.
- Face mesh: dense landmarks, blink, eye openness, mouth openness, head pose, blendshapes.
- Face regions: forehead, cheeks, eyes, nose, mouth, chin.
- Eye scan: eye openness и rough iris center.
- Tongue placeholder: сейчас только `mouth_open_landmark_heuristic`; для настоящего языка нужна отдельная segmentation/classification модель.
- Hand telemetry: landmarks, handedness, fingertips, openness, pinch.
- Body telemetry: pose landmarks from head to feet, visibility/presence, body box.
- Audio telemetry: RMS, peak, zero crossing rate, spectral centroid, rough pitch, voice activity. Raw audio не сохраняется.
- Wearables future layer: Apple Watch или другие smart watches/bands для heart rate, HRV, movement/activity, sleep/rest context, если есть явное согласие и безопасный export/API.
- GraphQL-style contract: schema, query, response envelope, `__typename`, descriptions.
- Interpretation baseline: time context, affect estimate, needs hypotheses.
- Temporal buffer: sliding feature window 10-120 seconds.
- Caregiver labels: explicit local labels exported as JSONL feature events.
- Caregiver review: current affect and needs hypotheses with evidence.
- Child mode: AR cat mask over the real face, plus calm need cards over the same telemetry.

## 3. Следующий слой: эмоции и чувства

Цель: не угадывать "истину", а давать взрослому вероятные состояния.

Текущий набор pure emotions:

- `positive` / Happy
- `neutral` / Calm
- `sad`
- `angry`
- `scared`
- `surprised`
- `confused`
- `tired`
- `hurt`
- `overloaded`
- `bored`
- `vocalizing`

Базовые числовые выходы:

- `valence`: негативное / нейтральное / позитивное направление.
- `arousal`: спокойствие / возбуждение / напряжение.
- `attention`: смотрит ли ребенок в сторону экрана/камеры.
- `engagement`: насколько ребенок включен во взаимодействие.
- `primary`: короткая метка из текущего набора pure emotions.
- `evidence`: какие сигналы повлияли на гипотезу.

Что добавить дальше:

- Персональная калибровка baseline: нейтральное лицо, обычная поза, типичные звуки.
- Разметка коротких сессий взрослым: "радость", "усталость", "раздражение", "интерес", "перегруз".
- Отдельный classifier поверх face blendshapes, pose, hands, audio features и времени дня.
- Отчет по ошибкам: false positive / false negative для каждой метки.

## 4. Следующий слой: базовые хотелки

Первый набор гипотез расширен из бытовых needs в AAC-style wants + core words:

- `drink`
- `eat`
- `toilet`
- `outside`
- `play`
- `sleep`
- `help`
- `break`
- `quiet`
- `hug`
- `more`
- `stop`
- `yes`
- `no`
- `music`

Почему так:

- Бытовые карточки закрывают routine needs: пить, есть, туалет, улица, сон.
- Core words вроде `more`, `stop`, `help`, `yes`, `no` переиспользуются в разных ситуациях и полезны даже когда мы не уверены в конкретной хотелке.
- `break`, `quiet`, `hug`, `music` добавлены как мягкие варианты для перегруза, усталости, успокоения и интереса.

Минимальный контракт:

- `name`
- `confidence`
- `evidence`
- `needsAdultConfirmation: true` на уровне продукта

Сигналы:

- Время дня и routine windows.
- Рот, язык/рот-событие, рука около рта.
- Звук без слов: мычание, напряжение, повторяющиеся вокализации.
- Руки: активность, pinch, pointing, self-touch.
- Тело: сидит/стоит, наклон, попытка уйти, напряжение.
- История последних минут: повторяемость сигналов важнее одного кадра.

## 5. Датасет и обучение

Нужен маленький персональный датасет, а не только публичные emotion-модели.

Workflow:

1. Взрослый запускает короткую сессию.
2. Приложение пишет только выбранные feature vectors и короткие локальные клипы/снапшоты, если это явно включено.
3. Взрослый ставит label: emotion, need, context, notes.
4. Данные можно удалить одной кнопкой.
5. Обучение начинается с простого baseline: kNN / logistic regression / SVM / tiny MLP.
6. Каждая новая модель сравнивается с baseline на holdout-сессиях.

## 6. Детский интерфейс

Текущий экран инженерный: точки и raw data.

Детский экран должен быть отдельным:

- AR cat mask поверх живого лица: настоящее лицо остается видимым, маска добавляет только уши, нос и усы.
- Никаких raw-точек, JSON и технических лейблов.
- Очень низкая сенсорная нагрузка: спокойные цвета, мягкое движение, без резких вспышек.
- Персонаж реагирует на состояние: успокаивает, просит взрослого проверить гипотезу, показывает простые карточки.
- Карточки эмоций: 🙂 happy, 😌 calm, 😢 sad, 😠 angry, 😨 scared, 😳 wow, 🤔 huh, 🥱 tired, 🤕 ouch, 🫨 too much, 😐 bored, 🗣️ sound.
- Карточки хотелок: 🥤 drink, 🍽️ eat, 🚽 toilet, 🌳 outside, 🧸 play, 😴 sleep, 🆘 help, 🛑 break, 🤫 quiet, 🤗 hug, ➕ more, ✋ stop, ✅ yes, ❌ no, 🎵 music.

## 7. Компоненты, которые нужно добавить

- Mouth/tongue model: сегментация или classifier по crop рта.
- Gesture layer: pointing, hand-to-mouth, self-touch, waving, grasping.
- Body posture layer: sitting, standing, leaning, leaving-frame, restlessness.
- Audio classifier: nonverbal vocalization events, pitch contour, intensity bursts.
- Wearable physiology layer: Apple Watch / smart watch / smart band signals: heart rate, HRV, motion, activity, sleep/rest context. Только как дополнительный контекст, не как медицинский вывод.
- Temporal buffer: sliding window 10-120 секунд для устойчивых выводов.
- Personal calibration: baseline by child, time of day, room/light/camera.
- Caregiver labeling UI: быстро поставить label прямо после события.
- Export/import: encrypted local bundle for перенос между устройствами.
- Passkey binding: WebAuthn for local ownership, без хранения биометрических хешей.

## 8. Технический порядок работ

1. Довести collector до стабильного raw telemetry contract. Done.
2. Добавить temporal buffer и rolling features. Done.
3. Сделать локальную разметку событий. Done.
4. Добавить caregiver review экран с confidence/evidence. Done.
5. Сделать child UI как отдельный режим поверх тех же данных. Done.
6. Собрать 20-50 коротких размеченных примеров на каждую целевую метку.
7. Обучить первый персональный classifier.
8. После этого думать про мобильную упаковку и passkeys.

## 9. Research queue

Локальная страница `../lab.html` содержит быстрый список кандидатов для тестов.

Исходная логика словаря:

- AAC-подход: отдельные карточки для wants/needs/feelings и повторно используемые core words.
- Core words для первого прототипа: `more`, `stop`, `help`, `yes`, `no`, потому что они полезны независимо от конкретного предмета.
- Pure emotions держим отдельно от wants, чтобы ребенок видел простую эмоциональную обратную связь, а взрослый видел гипотезу с evidence.

Технические кандидаты:

- MediaPipe Face Landmarker: текущая face mesh / blendshapes / pose основа.
- MediaPipe Hand Landmarker и Pose Landmarker: текущие руки и тело.
- TensorFlow.js face-landmarks-detection: альтернативная проверка стабильности face tracking.
- Jeeliz FaceFilter и MindAR: отдельные AR-mask кандидаты, если canvas-маске не хватит устойчивости.
- Mouth/tongue classifier: отдельный crop/segmentation слой, потому что текущий face model не дает надежный tongue class.
- Wearables: проверить Apple Health export / HealthKit-подход для будущего мобильного приложения и открытые протоколы браслетов, но не добавлять скрытый постоянный сбор данных.
