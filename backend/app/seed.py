import json

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Lesson, MarketplaceLink, Setting, SocialLink, User
from app.security import hash_password, normalize_phone

LESSONS = [
    {
        "slug": "register",
        "sort_order": 1,
        "title": {
            "tj": "Чӣ тавр сабти ном кардан",
            "ru": "Как зарегистрироваться",
            "en": "How to register",
        },
        "body": {
            "tj": "Ном, насаб, рақами телефон ва рамзро ворид кунед. Рамзи тасдиқро бо телефон мегиред. Баъд аз сабти ном система ба шумо ID-и ягона медиҳад.",
            "ru": "Введите имя, фамилию, телефон и пароль. Подтвердите телефон кодом. После регистрации система выдаст уникальный ID.",
            "en": "Enter your name, phone and password. Confirm the phone with a code. The system then issues a unique client ID.",
        },
    },
    {
        "slug": "china-address",
        "sort_order": 2,
        "title": {
            "tj": "Чӣ тавр суроғаи Хитойро гирифтан",
            "ru": "Как получить китайский адрес",
            "en": "How to get the China address",
        },
        "body": {
            "tj": "Дар саҳифаи асосӣ блоки «Суроғаи ман дар Хитой»-ро кушоед. Агар анбор аз тарафи ширкат пур карда шуда бошад, суроға, телефон ва ID-и шумо дар он ҷо меистад. Агар холӣ бошад, аввал ширкат бояд суроғаро ворид кунад.",
            "ru": "Откройте блок «Мой адрес в Китае» на главной. Адрес, телефон склада и ваш ID появятся после того, как компания заполнит данные склада.",
            "en": "Open “My address in China” on the home page. The warehouse address, phone and your ID appear after the company saves the warehouse.",
        },
    },
    {
        "slug": "order-goods",
        "sort_order": 3,
        "title": {
            "tj": "Чӣ тавр мол фармоиш додан",
            "ru": "Как заказать товар",
            "en": "How to order goods",
        },
        "body": {
            "tj": "Дар маркетплейси Чин суроғаи анборро ҳамчун суроғаи қабулкунанда гузоред. Мол ба анбори ширкат меояд ва корманд онро бо ID-и шумо сабт мекунад.",
            "ru": "Укажите адрес склада как адрес получателя на китайском маркетплейсе. Сотрудник склада зарегистрирует посылку на ваш ID.",
            "en": "Use the warehouse address as the recipient address on the Chinese marketplace. Staff will register the parcel against your ID.",
        },
    },
    {
        "slug": "indicate-id",
        "sort_order": 4,
        "title": {
            "tj": "Чӣ тавр ID-ро дуруст навиштан",
            "ru": "Как правильно указать ID",
            "en": "How to enter your ID",
        },
        "body": {
            "tj": "ID-и худро, масалан SAFI000001, дар суроға ё майдони эзоҳ нависед. Бе ин рамз анбор наметавонад молро ба ҳисоби шумо пайванд кунад.",
            "ru": "Напишите свой ID, например SAFI000001, в адресе или в примечании. Без этого кода склад не сможет привязать посылку к вам.",
            "en": "Put your ID, for example SAFI000001, in the address or the note field. Without it the warehouse cannot attach the parcel to you.",
        },
    },
    {
        "slug": "track",
        "sort_order": 5,
        "title": {
            "tj": "Чӣ тавр борро пайгирӣ кардан",
            "ru": "Как отслеживать посылку",
            "en": "How to track a parcel",
        },
        "body": {
            "tj": "Дар бахши Фармоишҳо молҳо аз рӯи марҳилаҳо ҷудо мешаванд: Анбори Хитой, Дар роҳ, Анбори Тоҷикистон, Ҷудокунӣ, Расонидан ва Қабул шуд. Рақами трекро низ ҷустуҷӯ кардан мумкин аст.",
            "ru": "В разделе заказов посылки разделены по этапам: склад Китая, в пути, склад Таджикистана, сортировка, доставка и получено. Трек-номер можно найти поиском.",
            "en": "Orders are grouped by stage: China warehouse, in transit, Tajikistan warehouse, sorting, delivery and received. You can also search by tracking number.",
        },
    },
    {
        "slug": "pickup",
        "sort_order": 6,
        "title": {
            "tj": "Чӣ тавр молро гирифтан",
            "ru": "Как получить товар",
            "en": "How to collect goods",
        },
        "body": {
            "tj": "Вақте мол ба марҳилаи Расонидан мегузарад, дар саҳифаи QR коди якдафъаина пайдо мешавад. Корманд онро месанҷад ва гирифтани молро тасдиқ мекунад.",
            "ru": "Когда заказ переходит в доставку, на странице QR появляется одноразовый код. Сотрудник сканирует его и подтверждает выдачу.",
            "en": "When an order is ready for delivery, a one-time QR code appears. Staff scan it and confirm the handover.",
        },
    },
]


def seed(db: Session) -> None:
    phone = normalize_phone(settings.admin_phone)
    if db.query(User).filter(User.phone == phone).first() is None:
        db.add(
            User(
                first_name=settings.admin_first_name,
                last_name=settings.admin_last_name,
                phone=phone,
                password_hash=hash_password(settings.admin_password),
                role="super_admin",
                language="tj",
            )
        )
    if db.query(Lesson).count() == 0:
        for item in LESSONS:
            db.add(
                Lesson(
                    slug=item["slug"],
                    sort_order=item["sort_order"],
                    title=json.dumps(item["title"], ensure_ascii=False),
                    body=json.dumps(item["body"], ensure_ascii=False),
                )
            )
    if db.query(MarketplaceLink).count() == 0:
        links = [
            ("pinduoduo", "Pinduoduo", "https://mobile.yangkeduo.com", 1),
            ("taobao", "Taobao", "https://www.taobao.com", 2),
            ("1688", "1688", "https://www.1688.com", 3),
            ("poizon", "Poizon", "https://www.poizon.com", 4),
        ]
        for key, name, url, sort_order in links:
            db.add(MarketplaceLink(key=key, name=name, url=url, is_active=True, sort_order=sort_order))
    if db.query(SocialLink).count() == 0:
        for key in ("instagram", "telegram", "whatsapp"):
            db.add(SocialLink(key=key, url="", is_active=False))
    defaults = {
        "banner": {
            "enabled": True,
            "title": {
                "tj": "SAFI KARGO",
                "ru": "SAFI KARGO",
                "en": "SAFI KARGO",
            },
            "subtitle": {
                "tj": "Расонидани бор аз Хитой ба Тоҷикистон",
                "ru": "Доставка грузов из Китая в Таджикистан",
                "en": "Cargo delivery from China to Tajikistan",
            },
        },
        "eta": {"tj": "", "ru": "", "en": ""},
        "terms": {"tj": "", "ru": "", "en": ""},
        "info_notice": {"tj": "", "ru": "", "en": ""},
    }
    for key, value in defaults.items():
        if db.get(Setting, key) is None:
            db.add(Setting(key=key, value=json.dumps(value, ensure_ascii=False)))
