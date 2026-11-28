def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_unconfirmed_email_cannot_open_cabinet(client):
    response = client.post(
        "/api/auth/register",
        json={
            "first_name": "Али",
            "last_name": "Тест",
            "phone": "+992900111099",
            "password": "SecretPass1",
            "password_confirm": "SecretPass1",
            "email": "ali@example.com",
            "supabase_access_token": "not-a-real-token",
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == "email_not_configured"
    assert "access_token" not in response.json()


def test_register_unique_ids_and_privacy(client):
    from tests.conftest import register

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["sms_configured"] is False

    first = register(client, "+992900111001", "Сафи")
    second = register(client, "+992900111002", "Дилшод")
    assert first["user"]["public_client_id"] != second["user"]["public_client_id"]
    assert first["user"]["public_client_id"].startswith("SAFI")
    assert first["user"]["phone"] == "+992900111001"

    denied = client.get("/api/admin/orders", headers=auth_header(first["access_token"]))
    assert denied.status_code == 403

    home = client.get("/api/client/home", headers=auth_header(first["access_token"]))
    assert home.status_code == 200
    assert home.json()["warehouse"] is None
    assert home.json()["tariffs"] == []


def test_orders_dispatch_statuses_qr_and_chat(client):
    from tests.conftest import login, register

    owner = register(client, "+992900111003", "Фарзона")
    other = register(client, "+992900111004", "Меҳр")
    admin = login(client, "+992900000001", "AdminPass123")
    admin_headers = auth_header(admin["access_token"])

    china = client.post(
        "/api/admin/staff",
        headers=admin_headers,
        json={
            "first_name": "Ли",
            "last_name": "Анбор",
            "phone": "+992900222001",
            "password": "ChinaPass1",
            "role": "warehouse_china",
        },
    )
    assert china.status_code == 200, china.text
    tajik = client.post(
        "/api/admin/staff",
        headers=admin_headers,
        json={
            "first_name": "Рустам",
            "last_name": "Анбор",
            "phone": "+992900222002",
            "password": "TajikPass1",
            "role": "warehouse_tajikistan",
        },
    )
    assert tajik.status_code == 200, tajik.text
    support = client.post(
        "/api/admin/staff",
        headers=admin_headers,
        json={
            "first_name": "Нигина",
            "last_name": "Дастгирӣ",
            "phone": "+992900222003",
            "password": "SupportPass1",
            "role": "support",
        },
    )
    assert support.status_code == 200, support.text
    rejected = client.post(
        "/api/admin/staff",
        headers=admin_headers,
        json={
            "first_name": "Рон",
            "last_name": "Рон",
            "phone": "+992900222004",
            "password": "DriverPass1",
            "role": "logistics_manager",
        },
    )
    assert rejected.status_code == 400

    china_headers = auth_header(login(client, "+992900222001", "ChinaPass1")["access_token"])
    tajik_headers = auth_header(login(client, "+992900222002", "TajikPass1")["access_token"])
    support_headers = auth_header(login(client, "+992900222003", "SupportPass1")["access_token"])
    owner_headers = auth_header(owner["access_token"])
    other_headers = auth_header(other["access_token"])
    public_id = owner["user"]["public_client_id"]

    order_ids = []
    for index in range(10):
        created = client.post(
            "/api/admin/orders",
            headers=china_headers,
            json={
                "public_client_id": public_id,
                "tracking_number": f"TRK-{index}",
                "title": f"Мол {index}",
                "weight": 1.5,
                "package_count": 1,
            },
        )
        assert created.status_code == 200, created.text
        order_ids.append(created.json()["id"])

    hidden = client.get("/api/client/orders", headers=other_headers)
    assert hidden.json()["counts"]["china_warehouse"] == 0
    missing = client.get("/api/client/track", params={"code": "TRK-1"}, headers=other_headers)
    assert missing.status_code == 404

    visible = client.get("/api/client/orders", params={"status": "china_warehouse"}, headers=owner_headers)
    assert len(visible.json()["items"]) == 10

    blocked = client.post(
        "/api/admin/dispatch",
        headers=support_headers,
        json={"order_ids": order_ids[:7], "transport": "Truck"},
    )
    assert blocked.status_code == 403

    sent = client.post(
        "/api/admin/dispatch",
        headers=china_headers,
        json={"order_ids": order_ids[:7], "transport": "Truck 01", "note": "Ба роҳ"},
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["count"] == 7

    counts = client.get("/api/client/orders", headers=owner_headers).json()["counts"]
    assert counts["china_warehouse"] == 3
    assert counts["in_transit"] == 7

    early = client.post(
        "/api/admin/transition",
        headers=china_headers,
        json={"order_ids": order_ids[:7], "to_status": "tj_warehouse"},
    )
    assert early.status_code == 403

    arrived = client.post(
        "/api/admin/transition",
        headers=tajik_headers,
        json={"order_ids": order_ids[:7], "to_status": "tj_warehouse"},
    )
    assert arrived.status_code == 200, arrived.text
    sorting = client.post(
        "/api/admin/transition",
        headers=tajik_headers,
        json={"order_ids": order_ids[:7], "to_status": "sorting"},
    )
    assert sorting.status_code == 200, sorting.text
    delivery = client.post(
        "/api/admin/transition",
        headers=tajik_headers,
        json={"order_ids": [order_ids[0]], "to_status": "delivery", "delivery_substatus": "ready_for_pickup"},
    )
    assert delivery.status_code == 200, delivery.text

    qr = client.get("/api/client/qr", headers=owner_headers)
    assert qr.status_code == 200, qr.text
    ready = qr.json()["ready"]
    assert len(ready) == 1
    token = ready[0]["token"]
    assert owner["user"]["phone"] not in token
    assert "SK1." in token

    confirmed = client.post("/api/admin/qr/confirm", headers=tajik_headers, json={"token": token})
    assert confirmed.status_code == 200, confirmed.text
    again = client.post("/api/admin/qr/confirm", headers=tajik_headers, json={"token": token})
    assert again.status_code == 400
    assert again.json()["detail"] == "token_used"

    detail = client.get(f"/api/client/orders/{order_ids[0]}", headers=owner_headers)
    assert detail.json()["current_status"] == "received"
    assert len(detail.json()["history"]) >= 5

    conversations = client.get("/api/chat/conversations", headers=owner_headers)
    conversation_id = conversations.json()["items"][0]["id"]
    sent_message = client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        headers=owner_headers,
        data={"content": "Бор куҷост?"},
    )
    assert sent_message.status_code == 200, sent_message.text
    inbox = client.get("/api/chat/conversations", headers=support_headers)
    assert inbox.json()["items"][0]["unread"] == 1
    reply = client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        headers=support_headers,
        data={"content": "Дар роҳ аст."},
    )
    assert reply.status_code == 200, reply.text
    thread = client.get(f"/api/chat/conversations/{conversation_id}/messages", headers=owner_headers)
    assert [item["content"] for item in thread.json()["items"]] == ["Бор куҷост?", "Дар роҳ аст."]

    nope = client.post(
        "/api/admin/transition",
        headers=support_headers,
        json={"order_ids": [order_ids[1]], "to_status": "delivery"},
    )
    assert nope.status_code == 403
