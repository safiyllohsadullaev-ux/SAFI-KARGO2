# SAFI KARGO

Платформаи боррасонӣ аз Хитой ба Тоҷикистон.

Номи бренд: **SAFI KARGO**.

## Чӣ кор мекунад

- Сабти ном ва вуруд бо рамзи телефон. Агар SMS пайваст набошад, рамз дар экран нишон дода мешавад ва ҳамчун «фиристода шуд» онаш намешавад.
- Ба ҳар муштарӣ ID-и ягона, масалан `SAFI000001`.
- Суроғаи анбори Хитой танҳо вақте намоён аст, ки администратор онро ворид кардааст.
- Шаш марҳилаи бор: Анбори Хитой → Дар роҳ → Анбори Тоҷикистон → Ҷудокунӣ → Расонидан → Қабул шуд.
- «Дар роҳ»-ро танҳо анбори Хитой ё администратори асосӣ иваз мекунад. Ронандаи алоҳида нест.
- Ҷустуҷӯ бо трек, QR-и якдафъаина барои додан, чати дастгирӣ, се забон: тоҷикӣ, русӣ, English.

Нарх, муҳлат, суроға, телефон ва шабакаҳои иҷтимоӣ то пур кардани онҳо аз тарафи ширкат холӣ мемонанд.

## Оғоз дар Windows 11 (VS Code)

Node.js дар ин компютер насб аст, вале баъзан дар PATH нест. Фармонҳо роҳи пурраро истифода мебаранд.

### 1. Сервер

```powershell
cd "C:\Users\safi\Desktop\SAFI KARGO2\backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

Агар `.env` аллакай бошад, `copy`-ро нагузаронед.

### 2. Сомона

Дар терминали дуюм:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cd "C:\Users\safi\Desktop\SAFI KARGO2\frontend"
npm install
npm run dev
```

Сомона: http://127.0.0.1:8000 барои API ва http://localhost:3000 барои саҳифаҳо.

Дар VS Code: Terminal → Run Task → `SAFI KARGO: API` ва `SAFI KARGO: Web`.

### Вуруди аввалияи администратор

- Телефон: `+992000000000`
- Рамз: `ChangeMe_Admin_2026`

Ин рақам ҳисоби ширкат нест. Пас аз вуруд онро иваз кунед.

### Санҷиш

```powershell
cd "C:\Users\safi\Desktop\SAFI KARGO2\backend"
.\.venv\Scripts\python.exe -m pytest
```

## Нақшҳо

- Super Admin — ҳама чиз
- Warehouse China — қабули мол ва «Ба роҳ фиристодан»
- Warehouse Tajikistan — расидан, ҷудокунӣ, расонидан, қабул, QR
- Support — танҳо паёмҳо

## Ҷойгиркунӣ дар Vercel

Се қисм дар як ҳисоби Vercel мемонанд: сомона (Next.js), API (FastAPI) ва пойгоҳи Postgres аз Neon. Аз як анбор ду лоиҳа созед.

### 1. Пойгоҳ

Дар Vercel: Storage → Browse Storage → Neon (Postgres) → Create. Пойгоҳро ба лоиҳаи API пайваст кунед. Vercel худ `DATABASE_URL`-ро мегузорад. Суроғаи дорои `-pooler`-ро барои API истифода баред.

SQLite дар Vercel кор намекунад: диски функсия пас аз чанд дақиқа тоза мешавад.

### 2. API

Лоиҳаи нав, ҳамон анбор:

- Root Directory: `backend`
- Framework: FastAPI (худ шинохта мешавад, нуқтаи вуруд `app/main.py`)

Муҳитҳо:

| Ном | Қимат |
| --- | --- |
| `DATABASE_URL` | аз Neon, агар худ наомада бошад |
| `JWT_SECRET` | сатри дароз ва тасодуфӣ, ҳадди ақал 24 аломат |
| `ADMIN_PHONE` | рақами худи шумо |
| `ADMIN_PASSWORD` | рамзи нав, на `ChangeMe_Admin_2026` |
| `DEV_OTP_REVEAL` | `false`. Дар Vercel барнома онро ба ҳар ҳол хомӯш мекунад |
| `FRONTEND_URL` | суроғаи сомона, масалан `https://safi-kargo.vercel.app` |
| `CORS_ORIGINS` | ҳамон суроға. Доменҳои `*.vercel.app` аллакай иҷозат доранд |
| `SMS_WEBHOOK_URL` | холӣ, то SMS-и ҳақиқӣ пайваст шавад |

Пас аз deploy кушоед: `https://НОМИ-API.vercel.app/api/health`. Ҷавоб бояд `"database": "postgres"` бошад. Ҷадвалҳо ва администратор дар оғози аввал сохта мешаванд.

### 3. Сомона

Лоиҳаи дуюм, ҳамон анбор:

- Root Directory: `frontend`
- Framework: Next.js

Муҳит, пеш аз Build:

`NEXT_PUBLIC_API_URL=https://НОМИ-API.vercel.app`

Бе хати охири `/`. Агар ин қиматро дертар иваз кунед, сомонаро аз нав Build кунед: он ҳангоми сохтан дохил мешавад.

### Маҳдудиятҳои Vercel

- Паёми чат бо HTTP меравад ва ҳар 15 сония нав мешавад. Пайвасти зиндаи WebSocket дар функсияи Vercel нест.
- Акс ва файл то 4 МБ дар худи Postgres нигоҳ дошта мешавад, на дар диск.
- Рамзи SMS дар экран нишон дода намешавад. То пайваст кардани SMS, сабти ном аз интернет кор намекунад.

## Production

1. `DEV_OTP_REVEAL=false`
2. `JWT_SECRET`-и дароз ва тасодуфӣ
3. `DATABASE_URL` аз Neon, ё барои сервери худ: `postgresql+psycopg://USER:PASSWORD@HOST:5432/safi_kargo`
4. `SMS_WEBHOOK_URL` ба хизмати воқеии SMS
5. `CORS_ORIGINS` ва `FRONTEND_URL` танҳо домени худи сомона
6. Рамзи администраторро иваз кунед
7. Нусхаи пойгоҳ: `pg_dump` бо суроғаи бевоситаи Neon (бе `-pooler`)

PostgreSQL-и маҳаллӣ:

```powershell
docker compose up -d
```

Сипас дар `.env` суроғаи PostgreSQL-ро гузоред ва серверро аз нав оғоз кунед. Ҷадвалҳо ҳангоми оғоз сохта мешаванд. Мигратсия:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```
