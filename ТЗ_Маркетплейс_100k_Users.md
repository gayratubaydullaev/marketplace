# ТЕХНИЧЕСКОЕ ЗАДАНИЕ
## Маркетплейс с поддержкой Single-Store и Multi-Vendor режимов
### Версия: 1.0 | Дата: 15.07.2026

---

## 1. ОБЩИЕ СВЕДЕНИЯ

### 1.1. Назначение документа

Настоящее техническое задание (ТЗ) определяет требования к разработке масштабируемой платформы электронной коммерции, поддерживающей два режима работы:
- **Single-Store** — классический интернет-магазин одного владельца
- **Multi-Vendor** — маркетплейс с независимыми продавцами

### 1.2. Цель проекта

Создание высоконагруженной платформы электронной коммерции, способной обслуживать **100 000+ одновременных пользователей**, с гибкой архитектурой переключения между режимами single-store и multi-vendor без изменения кодовой базы.

### 1.3. Область применения

- B2C и B2B электронная коммерция
- Нишевые маркетплейсы (handmade, цифровые товары, услуги)
- Агрегаторы товаров и услуг
- White-label решения для франчайзи

### 1.4. Сроки и этапы

| Этап | Содержание | Срок |
|------|-----------|------|
| Этап 1 | Архитектура, DevOps, инфраструктура | 6 недель |
| Этап 2 | Core API (Auth, Users, Catalog) | 8 недель |
| Этап 3 | E-commerce (Cart, Orders, Payments) | 8 недель |
| Этап 4 | Multi-vendor (Vendors, Commissions, Payouts) | 6 недель |
| Этап 5 | Frontend (Storefront, Dashboards) | 10 недель |
| Этап 6 | Search, Analytics, Real-time | 6 недель |
| Этап 7 | Тестирование, оптимизация, нагрузочное | 6 недель |
| **Итого** | | **50 недель (~12 месяцев)** |

---

## 2. ТРЕБОВАНИЯ К СИСТЕМЕ

### 2.1. Функциональные требования

#### 2.1.1. Управление режимами работы (Single-Store / Multi-Vendor)

**FR-1.1.** Система должна поддерживать переключение между режимами single-store и multi-vendor через конфигурацию tenant'а без пересборки приложения.

**FR-1.2.** В режиме single-store:
- Все товары принадлежат одному владельцу (tenant)
- Отсутствует концепция vendor'а
- Упрощённый UI (нет фильтра по продавцу, нет страницы продавца)
- Прямые платежи на счёт владельца платформы

**FR-1.3.** В режиме multi-vendor:
- Каждый товар привязан к vendor'у
- Независимые vendor-дашборды
- Комиссионная модель (процент от продажи)
- Split-платежи (автоматическое распределение между vendor'ом и платформой)
- Рейтинги и отзывы на vendor'ов

**FR-1.4.** Переключение режима должно осуществляться на уровне tenant'а через админ-панель с миграцией существующих данных.

#### 2.1.2. Аутентификация и авторизация (Auth Service)

**FR-2.1.** Поддержка методов аутентификации:
- Email + пароль (bcrypt, min 8 символов)
- OAuth 2.0 (Google, Apple, Facebook)
- OTP (SMS / Email) для 2FA
- JWT access token (15 мин) + refresh token (7 дней)

**FR-2.2.** Ролевая модель (RBAC):
| Роль | Описание |
|------|----------|
| `super_admin` | Полный доступ ко всем tenant'ам |
| `tenant_admin` | Управление одним tenant'ом |
| `vendor` | Управление своими товарами и заказами |
| `customer` | Покупатель |
| `manager` | Сотрудник tenant'а (заказы, поддержка) |
| `moderator` | Модерация контента |

**FR-2.3.** Row Level Security (RLS) — изоляция данных на уровне строк БД по tenant_id.

**FR-2.4.** Rate limiting: 100 запросов/мин для анонимных, 1000/мин для авторизованных.

#### 2.1.3. Каталог товаров (Catalog Service)

**FR-3.1.** Иерархическая структура категорий (дерево, неограниченная вложенность).

**FR-3.2.** Атрибуты товаров:
- Динамические атрибуты по категории (цвет, размер, материал)
- Варианты товаров (SKU-level: цвет + размер = отдельный SKU)
- Ценообразование по вариантам
- Инвентарь по вариантам

**FR-3.3.** Медиа:
- До 20 изображений на товар
- Видео (до 100MB)
- 3D-модели (GLB/GLTF)
- CDN-оптимизация (WebP, адаптивные размеры)

**FR-3.4.** Статусы товара:
```
draft → pending_review → active → out_of_stock → archived
         ↓
      rejected (с причиной)
```

**FR-3.5.** Bulk-операции:
- Импорт CSV/Excel (до 10 000 товаров за раз)
- Экспорт
- Bulk edit (цена, статус, категория)

**FR-3.6.** SEO:
- Кастомные URL (slug)
- Meta title, description, keywords
- Open Graph tags
- Schema.org JSON-LD
- Sitemap.xml (автогенерация)

#### 2.1.4. Поиск (Search Service)

**FR-4.1.** Полнотекстовый поиск с:
- Автокомплит (подсказки за <50ms)
- Typo-tolerance (растояние Левенштейна ≤2)
- Синонимы (настраиваемые)
- Фасетный поиск (фильтры по атрибутам)
- Сортировка (релевантность, цена, новизна, рейтинг)

**FR-4.2.** Поисковая аналитика:
- Популярные запросы
- Запросы без результатов
- CTR по позициям

#### 2.1.5. Корзина и оформление заказа (Cart & Checkout Service)

**FR-5.1.** Корзина:
- Гостевая корзина (сохранение в localStorage + merge при авторизации)
- Мульти-vendor корзина (группировка по продавцам)
- Промокоды и купоны
- Подарочные сертификаты
- Расчёт доставки в реальном времени

**FR-5.2.** Оформление заказа (чекаут):
- Многошаговый или одностраничный режим
- Адресная книга (сохранённые адреса)
- Выбор способа доставки (интеграция с логистикой)
- Выбор способа оплаты
- Предпросмотр заказа
- Гостевой чекаут (без регистрации)

**FR-5.3.** Статусы заказа:
```
pending → confirmed → processing → shipped → delivered → completed
   ↓           ↓           ↓
cancelled  refunded   returned
```

#### 2.1.6. Платежи (Payments Service)

**FR-6.1.** Интеграции:
- **Stripe** (основной) — карты, Apple Pay, Google Pay
- **Stripe Connect** (multi-vendor) — автоматические выплаты
- **PayPal**
- **Банковские переводы** (manual confirmation)
- **Криптовалюты** (Bitcoin, Ethereum — опционально)

**FR-6.2.** Single-store:
- Прямой платёж на счёт tenant'а

**FR-6.3.** Multi-vendor:
- Split-платёж при чекауте
- Комиссия платформы (настраиваемый %)
- Автоматические выплаты vendor'ам (ежеднедельные/ежемесячные)
- Холдирование средств (escrow) — опционально
- Детальный отчёт по выплатам

**FR-6.4.** Безопасность:
- PCI DSS compliance (через Stripe — не храним данные карт)
- 3D Secure
- Idempotency keys
- Webhook verification

#### 2.1.7. Multi-Vendor (Vendor Service)

**FR-7.1.** Регистрация vendor'а:
- Подача заявки (KYC: документы, банковские реквизиты)
- Модерация админом
- Автоматическое создание Stripe Connect account

**FR-7.2.** Vendor Dashboard:
- Статистика продаж (графики, периоды)
- Управление товарами
- Управление заказами
- Управление инвентарём
- Финансы (выплаты, комиссии, отчёты)
- Настройки магазина (логотип, описание, политики)

**FR-7.3.** Комиссии:
- Глобальная комиссия платформы (настраиваемый %)
- Индивидуальные комиссии по vendor'у
- Комиссии по категориям товаров
- Комиссии по объёму продаж (tiered)

**FR-7.4.** Vendor-страница:
- Профиль vendor'а (логотип, описание, рейтинг)
- Каталог товаров vendor'а
- Отзывы на vendor'а
- Политики (доставка, возврат)

#### 2.1.8. Отзывы и рейтинги (Reviews Service)

**FR-8.1.** Отзывы на товары:
- Только после покупки (verified purchase)
- Рейтинг 1-5 звёзд
- Текст + фото/видео
- Полезность отзыва (лайки)
- Ответ vendor'а

**FR-8.2.** Отзывы на vendor'ов (multi-vendor):
- Общий рейтинг
- Категории: скорость доставки, качество товара, общение

**FR-8.3.** Модерация:
- Автоматическая (AI: токсичность, спам)
- Ручная (moderator queue)

#### 2.1.9. Уведомления и коммуникации (Notifications Service)

**FR-9.1.** Каналы:
- Email (SendGrid / AWS SES)
- Push (Firebase Cloud Messaging)
- SMS (Twilio)
- In-app notifications
- WebSocket real-time

**FR-9.2.** Триггеры:
- Заказ создан/оплачен/отправлен/доставлен
- Новый отзыв
- Изменение статуса товара
- Промо-акции
- Системные уведомления

**FR-9.3.** Настройки пользователя:
- Выбор каналов по типу уведомления
- Частота (мгновенно, дайджест, отключить)

#### 2.1.10. Аналитика (Analytics Service)

**FR-10.1.** Дашборд tenant'а:
- Выручка, заказы, конверсия
- Топ товаров
- Топ vendor'ов (multi-vendor)
- География продаж
- Источники трафика

**FR-10.2.** Дашборд vendor'а:
- Продажи, выручка, комиссии
- Топ товаров
- Конверсия

**FR-10.3.** Real-time метрики:
- Активные пользователи
- Текущие заказы
- Revenue per minute

### 2.2. Нефункциональные требования

#### 2.2.1. Производительность

| Метрика | Требование |
|---------|-----------|
| Время отклика API (p95) | < 100ms для кэшированных, < 300ms для БД |
| Время загрузки страницы (LCP) | < 2.5s |
| First Input Delay (FID) | < 100ms |
| Cumulative Layout Shift (CLS) | < 0.1 |
| Пропускная способность | 100 000+ concurrent users |
| Поисковый автокомплит | < 50ms |
| Чекаут (submit to confirmation) | < 3s |

#### 2.2.2. Надёжность

| Метрика | Требование |
|---------|-----------|
| Uptime SLA | 99.99% |
| RTO (Recovery Time Objective) | < 15 минут |
| RPO (Recovery Point Objective) | < 1 минута |
| Деградация при перегрузке | Graceful degradation (кэшированные данные, read-only режим) |

#### 2.2.3. Масштабируемость

| Метрика | Требование |
|---------|-----------|
| Горизонтальное масштабирование | Авто-скейлинг по CPU/memory |
| База данных | Шардирование по tenant_id (Citus) |
| Кэш | Redis Cluster, репликация |
| Поиск | Elasticsearch cluster, 3+ ноды |
| Файлы | MinIO/S3 с CDN |

#### 2.2.4. Безопасность

- OWASP Top 10 compliance
- SQL Injection prevention (parameterized queries)
- XSS protection (CSP headers, output encoding)
- CSRF tokens
- Rate limiting (per IP, per user, per endpoint)
- Data encryption at rest (AES-256) и in transit (TLS 1.3)
- GDPR / CCPA compliance (data export, deletion, consent)
- Audit log (все изменения данных)
- Penetration testing (ежеквартально)

#### 2.2.5. Локализация

- Поддержка 20+ языков
- RTL (Arabic, Hebrew)
- Мультивалютность (150+ валют, обновление курсов)
- Налоги по регионам (VAT, sales tax)
- Форматы дат/чисел/адресов по локали

---

## 3. АРХИТЕКТУРА СИСТЕМЫ

### 3.1. Общая архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                         CDN LAYER                                  │
│  Cloudflare (DDoS, WAF, Static Cache, Geo-routing)               │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                      EDGE LAYER                                    │
│  Vercel Edge Functions (ISR, personalization, A/B testing)         │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│                    API GATEWAY                                     │
│  Kong / AWS API Gateway                                          │
│  - Rate Limiting                                                 │
│  - JWT Validation                                                │
│  - Request Routing                                               │
│  - SSL Termination                                               │
│  - API Versioning (v1, v2)                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌──────────┬──────────┼──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼          ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
   │  Auth   │ │ Catalog │ │  Cart   │ │ Orders  │ │Payments │ │ Vendors │
   │ Service │ │ Service │ │Service  │ │ Service │ │ Service │ │ Service │
   │  (Go)   │ │  (Go)   │ │  (Go)   │ │  (Go)   │ │  (Go)   │ │  (Go)   │
   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
        │           │           │           │           │           │
        └───────────┴───────────┴───────────┴───────────┴───────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              ┌──────────┐        ┌──────────┐
              │  Kafka   │        │  Redis   │
              │ (Events) │        │ Cluster  │
              └────┬─────┘        │ (Cache)  │
                   │              └────┬─────┘
        ┌─────────┼─────────┐         │
        ▼         ▼         ▼         ▼
   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
   │PostgreSQL│ │ClickHouse│ │Elastic │ │MinIO   │
   │ + Citus │ │(Analytics│ │search  │ │Cluster │
   │(Shards) │ │ Events)  │ │        │ │(Files) │
   └────────┘ └────────┘ └────────┘ └────────┘
```

### 3.2. Микросервисы

| Сервис | Язык | База | Описание |
|--------|------|------|----------|
| **API Gateway** | Go (Kong) | — | Маршрутизация, rate limiting, auth |
| **Auth Service** | Go | PostgreSQL | Регистрация, логин, JWT, RBAC, sessions |
| **Catalog Service** | Go | PostgreSQL + Redis | Товары, категории, атрибуты, инвентарь |
| **Search Service** | Go | Elasticsearch | Полнотекстовый поиск, фасеты, автокомплит |
| **Cart Service** | Go | Redis + PostgreSQL | Корзина, промокоды, расчёт доставки |
| **Orders Service** | Go | PostgreSQL | Заказы, статусы, история |
| **Payments Service** | Go | PostgreSQL | Платежи, refunds, split-payments, payouts |
| **Vendor Service** | Go | PostgreSQL | Vendor профили, комиссии, дашборды |
| **Reviews Service** | Go | PostgreSQL | Отзывы, рейтинги, модерация |
| **Notifications Service** | Go | PostgreSQL + Redis | Email, push, SMS, in-app |
| **Analytics Service** | Go | ClickHouse | Агрегации, отчёты, real-time метрики |
| **Media Service** | Go | MinIO | Загрузка, обработка, CDN-раздача файлов |
| **Real-time Service** | Go (Centrifugo) | Redis | WebSockets, SSE, чат |

### 3.3. Frontend архитектура

```
┌─────────────────────────────────────────────┐
│           Next.js 15 (App Router)            │
│                                              │
│  ┌─────────────┐  ┌─────────────┐           │
│  │  Storefront │  │   Admin     │           │
│  │  (public)   │  │  (internal) │           │
│  └─────────────┘  └─────────────┘           │
│                                              │
│  ┌─────────────┐  ┌─────────────┐           │
│  │   Vendor    │  │  Customer   │           │
│  │  Dashboard  │  │   Account   │           │
│  └─────────────┘  └─────────────┘           │
│                                              │
│  Shared:                                     │
│  - shadcn/ui components                      │
│  - Zustand stores                            │
│  - React Query (TanStack Query)              │
│  - tRPC / REST clients                       │
│  - i18n (next-intl)                          │
└─────────────────────────────────────────────┘
```

### 3.4. Data Flow

```
Пользователь → CDN → Edge → API Gateway → Сервис → БД
                              ↓
                         Kafka (async events)
                              ↓
                    Analytics, Notifications, Search Index
```

### 3.5. Event-Driven Architecture (Kafka Topics)

| Topic | Производитель | Потребители |
|-------|--------------|-------------|
| `user.registered` | Auth | Notifications, Analytics |
| `product.created` | Catalog | Search (index), Analytics |
| `product.updated` | Catalog | Search (reindex), Cache (invalidate) |
| `cart.updated` | Cart | Analytics, Recommendations |
| `order.created` | Orders | Payments, Notifications, Inventory |
| `order.paid` | Payments | Orders, Notifications, Vendor (payout) |
| `order.shipped` | Orders | Notifications, Tracking |
| `review.submitted` | Reviews | Notifications, Vendor (rating update) |
| `vendor.registered` | Vendor | Auth, Payments (Stripe Connect), Notifications |

---

## 4. ТЕХНОЛОГИЧЕСКИЙ СТЕК

### 4.1. Frontend

| Компонент | Технология | Версия |
|-----------|-----------|--------|
| Framework | Next.js | 15.x |
| Language | TypeScript | 5.8.x |
| Runtime | React | 19.x |
| Routing | App Router (Server Components) | — |
| Styling | Tailwind CSS | 4.x |
| Components | shadcn/ui + Radix UI | latest |
| State (client) | Zustand | 5.x |
| State (server) | TanStack Query (React Query) | 5.x |
| Forms | React Hook Form + Zod | latest |
| i18n | next-intl | latest |
| Charts | Recharts / Tremor | latest |
| Maps | Leaflet / Mapbox | latest |
| Testing | Vitest + React Testing Library + Playwright | latest |
| Build | Turborepo (monorepo) | latest |

### 4.2. Backend

| Компонент | Технология | Версия |
|-----------|-----------|--------|
| Language | Go | 1.24.x |
| Web Framework | Gin / Echo | latest |
| gRPC | protobuf + grpc-go | latest |
| ORM | GORM / sqlx | latest |
| Validation | go-playground/validator | latest |
| Auth | JWT (golang-jwt) + bcrypt | latest |
| Testing | testify + mockery | latest |
| Documentation | Swagger (swaggo) | latest |

### 4.3. Базы данных и хранилища

| Компонент | Технология | Назначение |
|-----------|-----------|------------|
| Primary DB | PostgreSQL 16 + Citus | Основные данные, шардирование |
| Cache | Redis 7 Cluster | Сессии, кэш, rate limiting, очереди |
| Search | Elasticsearch 8 | Полнотекстовый поиск |
| Analytics | ClickHouse | OLAP, агрегации, отчёты |
| NoSQL (опционально) | ScyllaDB | Сессии, корзины, временные данные |
| Files | MinIO Cluster | S3-compatible, изображения, документы |
| Message Queue | Apache Kafka 3.x | Event streaming |
| Job Queue | BullMQ (Redis-based) | Фоновые задачи |

### 4.4. Инфраструктура

| Компонент | Технология |
|-----------|-----------|
| Containerization | Docker + Docker Compose (dev), Kubernetes (prod) |
| Orchestration | Kubernetes (EKS / GKE) |
| Service Mesh | Istio |
| API Gateway | Kong / AWS API Gateway |
| CDN | Cloudflare |
| Edge | Vercel Edge Functions |
| CI/CD | GitHub Actions |
| GitOps | ArgoCD |
| IaC | Terraform + Pulumi |
| Monitoring | Prometheus + Grafana |
| Logging | Loki + Grafana |
| Tracing | Jaeger / OpenTelemetry |
| APM | Datadog / New Relic |
| Error Tracking | Sentry |
| Secrets | HashiCorp Vault / AWS Secrets Manager |

### 4.5. Интеграции

| Сервис | Интеграция | Назначение |
|--------|-----------|------------|
| Stripe | Stripe Connect | Платежи, split-payments, payouts |
| PayPal | REST API | Альтернативный платёж |
| SendGrid / AWS SES | SMTP / API | Email-уведомления |
| Twilio | REST API | SMS |
| Firebase | FCM | Push-уведомления |
| Google Maps | Places API | Адреса, геокодинг |
| ShipStation / EasyPost | REST API | Логистика, трекинг |

---

## 5. БАЗА ДАННЫХ

### 5.1. Схема шардирования (Citus)

```sql
-- Distributed table by tenant_id
SELECT create_distributed_table('products', 'tenant_id');
SELECT create_distributed_table('orders', 'tenant_id');
SELECT create_distributed_table('users', 'tenant_id');

-- Reference tables (replicated to all nodes)
SELECT create_reference_table('categories');
SELECT create_reference_table('attributes');
```

### 5.2. Основные сущности

#### tenants
```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('single_store', 'multi_vendor')),
    settings JSONB DEFAULT '{}',
    commission_rate DECIMAL(5,2) DEFAULT 10.00, -- %
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    role VARCHAR(50) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    avatar_url VARCHAR(500),
    email_verified BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);
```

#### vendors (multi-vendor mode)
```sql
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL, -- owner
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    banner_url VARCHAR(500),
    commission_rate DECIMAL(5,2), -- override tenant rate
    stripe_account_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending', -- pending, active, suspended
    kyc_verified BOOLEAN DEFAULT FALSE,
    rating DECIMAL(2,1) DEFAULT 0.0,
    review_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);
```

#### products
```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    vendor_id UUID, -- NULL for single-store
    category_id UUID NOT NULL,
    name VARCHAR(500) NOT NULL,
    slug VARCHAR(500) NOT NULL,
    description TEXT,
    short_description VARCHAR(1000),
    sku VARCHAR(100),
    price DECIMAL(12,2) NOT NULL,
    compare_at_price DECIMAL(12,2),
    cost_price DECIMAL(12,2),
    currency VARCHAR(3) DEFAULT 'USD',
    inventory_quantity INTEGER DEFAULT 0,
    inventory_policy VARCHAR(20) DEFAULT 'deny', -- deny, continue
    weight DECIMAL(10,2),
    weight_unit VARCHAR(10) DEFAULT 'kg',
    status VARCHAR(20) DEFAULT 'draft',
    is_featured BOOLEAN DEFAULT FALSE,
    seo_title VARCHAR(70),
    seo_description VARCHAR(320),
    seo_keywords VARCHAR(500),
    attributes JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    rating DECIMAL(2,1) DEFAULT 0.0,
    review_count INTEGER DEFAULT 0,
    sales_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);
```

#### product_variants
```sql
CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL,
    sku VARCHAR(100) NOT NULL,
    price DECIMAL(12,2),
    compare_at_price DECIMAL(12,2),
    inventory_quantity INTEGER DEFAULT 0,
    options JSONB NOT NULL, -- {"color": "red", "size": "M"}
    image_url VARCHAR(500),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### orders
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    user_id UUID NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    payment_status VARCHAR(20) DEFAULT 'pending',
    fulfillment_status VARCHAR(20) DEFAULT 'unfulfilled',
    currency VARCHAR(3) DEFAULT 'USD',
    subtotal DECIMAL(12,2) NOT NULL,
    discount_total DECIMAL(12,2) DEFAULT 0,
    shipping_total DECIMAL(12,2) DEFAULT 0,
    tax_total DECIMAL(12,2) DEFAULT 0,
    total DECIMAL(12,2) NOT NULL,
    shipping_address JSONB NOT NULL,
    billing_address JSONB,
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, order_number)
);
```

#### order_items
```sql
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL,
    product_id UUID NOT NULL,
    variant_id UUID,
    vendor_id UUID, -- for multi-vendor split
    name VARCHAR(500) NOT NULL,
    sku VARCHAR(100),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    commission_amount DECIMAL(12,2) DEFAULT 0,
    vendor_payout_amount DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### payments
```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    order_id UUID NOT NULL,
    user_id UUID NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    provider VARCHAR(50) NOT NULL, -- stripe, paypal
    provider_payment_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### vendor_payouts
```sql
CREATE TABLE vendor_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    vendor_id UUID NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    commission_total DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, processing, completed, failed
    stripe_transfer_id VARCHAR(255),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5.3. Индексы

```sql
-- Поисковые
CREATE INDEX idx_products_tenant_status ON products(tenant_id, status);
CREATE INDEX idx_products_vendor ON products(vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_featured ON products(tenant_id, is_featured) WHERE is_featured = TRUE;

-- Полнотекстовый поиск
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Заказы
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- RLS Policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
    USING (tenant_id = current_setting('app.current_tenant')::UUID);
```

---

## 6. API СПЕЦИФИКАЦИЯ

### 6.1. REST API (публичный)

Базовый URL: `https://api.{tenant}.marketplace.com/v1`

#### Auth

```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/refresh
POST   /v1/auth/logout
POST   /v1/auth/forgot-password
POST   /v1/auth/reset-password
POST   /v1/auth/oauth/{provider}
GET    /v1/auth/me
PUT    /v1/auth/me
```

#### Products

```
GET    /v1/products                    # List (pagination, filters, sort)
GET    /v1/products/{slug}             # Detail
GET    /v1/products/{slug}/related     # Related products
GET    /v1/products/{slug}/reviews     # Product reviews
POST   /v1/products                    # Create (vendor/admin)
PUT    /v1/products/{id}               # Update
DELETE /v1/products/{id}               # Delete (soft)
POST   /v1/products/{id}/images      # Upload images
```

#### Categories

```
GET    /v1/categories                  # Tree structure
GET    /v1/categories/{slug}/products  # Products in category
```

#### Cart

```
GET    /v1/cart                        # Get cart
POST   /v1/cart/items                  # Add item
PUT    /v1/cart/items/{id}             # Update quantity
DELETE /v1/cart/items/{id}             # Remove item
POST   /v1/cart/apply-coupon           # Apply promo code
DELETE /v1/cart/coupon                 # Remove coupon
POST   /v1/cart/shipping-estimate     # Calculate shipping
```

#### Orders

```
POST   /v1/orders                      # Create from cart
GET    /v1/orders                      # List (customer)
GET    /v1/orders/{id}                 # Detail
POST   /v1/orders/{id}/cancel          # Cancel
GET    /v1/orders/{id}/tracking        # Tracking info
```

#### Payments

```
POST   /v1/payments/intent             # Create payment intent
POST   /v1/payments/confirm            # Confirm payment
POST   /v1/payments/webhooks/stripe    # Stripe webhook
```

#### Vendors (multi-vendor)

```
POST   /v1/vendors/apply               # Apply as vendor
GET    /v1/vendors                     # List
GET    /v1/vendors/{slug}              # Public profile
GET    /v1/vendors/{slug}/products     # Vendor products
GET    /v1/vendors/{slug}/reviews      # Vendor reviews
```

#### Vendor Dashboard (protected)

```
GET    /v1/vendor/dashboard/stats      # Sales stats
GET    /v1/vendor/orders               # Vendor orders
GET    /v1/vendor/products             # Vendor products
GET    /v1/vendor/payouts              # Payout history
GET    /v1/vendor/settings             # Vendor settings
PUT    /v1/vendor/settings             # Update settings
```

#### Search

```
GET    /v1/search?q={query}&filters={}&sort={}&page={}&limit={}
GET    /v1/search/suggest?q={query}    # Autocomplete
GET    /v1/search/facets?q={query}     # Available filters
```

#### Reviews

```
POST   /v1/products/{id}/reviews       # Create review (verified purchase)
GET    /v1/products/{id}/reviews     # List
POST   /v1/reviews/{id}/helpful        # Mark helpful
```

### 6.2. gRPC API (межсервисное общение)

```protobuf
syntax = "proto3";

package catalog;

service CatalogService {
  rpc GetProduct(GetProductRequest) returns (Product);
  rpc ListProducts(ListProductsRequest) returns (ProductList);
  rpc CreateProduct(CreateProductRequest) returns (Product);
  rpc UpdateProduct(UpdateProductRequest) returns (Product);
  rpc DeleteProduct(DeleteProductRequest) returns (Empty);
  rpc UpdateInventory(UpdateInventoryRequest) returns (InventoryResponse);
}

message Product {
  string id = 1;
  string tenant_id = 2;
  string vendor_id = 3;
  string name = 4;
  string slug = 5;
  double price = 6;
  int32 inventory_quantity = 7;
  string status = 8;
  repeated string image_urls = 9;
}
```

### 6.3. WebSocket Events (Real-time)

```javascript
// Connection
const ws = new WebSocket('wss://ws.marketplace.com');
ws.send(JSON.stringify({
  type: 'subscribe',
  channels: ['orders', 'notifications'],
  token: 'JWT_TOKEN'
}));

// Events
{
  "type": "order.status_updated",
  "data": {
    "order_id": "...",
    "status": "shipped",
    "tracking_number": "..."
  }
}
```

---

## 7. FRONTEND

### 7.1. Страницы Storefront

| Страница | Описание | SEO |
|----------|----------|-----|
| `/` | Главная, featured products, категории | ✅ |
| `/products` | Каталог с фильтрами | ✅ |
| `/products/{slug}` | Карточка товара | ✅ |
| `/categories/{slug}` | Категория | ✅ |
| `/vendors` | Список vendor'ов (multi-vendor) | ✅ |
| `/vendors/{slug}` | Профиль vendor'а | ✅ |
| `/cart` | Корзина | ❌ (noindex) |
| `/checkout` | Оформление заказа | ❌ |
| `/orders` | История заказов | ❌ |
| `/orders/{id}` | Деталь заказа | ❌ |
| `/account` | Личный кабинет | ❌ |
| `/search?q=` | Результаты поиска | ✅ |

### 7.2. Admin Dashboard

| Модуль | Функционал |
|--------|-----------|
| Overview | KPI, графики, real-time |
| Products | CRUD, bulk, import/export |
| Orders | Управление, статусы, refunds |
| Customers | Список, деталь, история |
| Vendors | Модерация, комиссии, payouts |
| Categories | Дерево, атрибуты |
| Promotions | Купоны, скидки, акции |
| Reviews | Модерация |
| Settings | Общие, SEO, платежи, доставка |
| Analytics | Отчёты, экспорт |

### 7.3. Vendor Dashboard

| Модуль | Функционал |
|--------|-----------|
| Overview | Продажи, заказы, выручка |
| Products | CRUD, инвентарь |
| Orders | Управление заказами |
| Analytics | Статистика |
| Finances | Выплаты, комиссии |
| Reviews | Ответы на отзывы |
| Settings | Профиль, политики |

---

## 8. БЕЗОПАСНОСТЬ

### 8.1. Аутентификация

- JWT access token (RS256, 15 мин)
- Refresh token (rotate, 7 дней)
- Fingerprint binding (device + IP)
- Brute-force protection (5 попыток → lock 15 мин)

### 8.2. Авторизация

- RBAC middleware
- Resource-level permissions ("может редактировать только свои товары")
- RLS в PostgreSQL

### 8.3. Защита данных

- AES-256 для sensitive data at rest
- TLS 1.3 in transit
- HashiCorp Vault для secrets
- PCI DSS (через Stripe, не храним карты)

### 8.4. Compliance

- GDPR: data export, right to erasure, consent tracking
- CCPA: opt-out, data disclosure
- Cookie consent banner
- Privacy policy, Terms of service

---

## 9. ТЕСТИРОВАНИЕ

### 9.1. Типы тестов

| Тип | Инструмент | Покрытие |
|-----|-----------|----------|
| Unit | Go test, Vitest | > 80% |
| Integration | Postman / k6 | API endpoints |
| E2E | Playwright | Критические user flows |
| Load | k6 / Locust | 100k concurrent |
| Security | OWASP ZAP | Ежеквартально |
| Chaos | Gremlin | Отказоустойчивость |

### 9.2. Нагрузочное тестирование

```javascript
// k6 script example
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10000 },   // Ramp up
    { duration: '5m', target: 100000 },   // Steady state
    { duration: '2m', target: 200000 },   // Spike
    { duration: '5m', target: 100000 },   // Recovery
    { duration: '2m', target: 0 },        // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://api.marketplace.com/v1/products');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 300ms': (r) => r.timings.duration < 300,
  });
}
```

---

## 10. ДЕПЛОЙ И МОНИТОРИНГ

### 10.1. CI/CD Pipeline

```
Git Push → GitHub Actions → Test → Build Docker → Push Registry
                                    ↓
                              ArgoCD (GitOps)
                                    ↓
                              Kubernetes (Staging → Production)
```

### 10.2. Мониторинг

| Метрика | Инструмент | Алерт |
|---------|-----------|-------|
| CPU/Memory | Prometheus | > 80% |
| Response Time | Prometheus | p95 > 300ms |
| Error Rate | Sentry | > 0.1% |
| DB Connections | Prometheus | > 80% |
| Queue Depth | Prometheus | > 1000 |
| Disk Space | Prometheus | > 85% |

### 10.3. Логирование

- Structured logs (JSON)
- Correlation ID (trace across services)
- Retention: 30 дней (hot), 1 год (cold S3)

---

## 11. ПЛАН РАЗРАБОТКИ

### 11.1. Команда

| Роль | Кол-во | Задачи |
|------|--------|--------|
| Tech Lead / Architect | 1 | Архитектура, код-ревью, решения |
| Backend (Go) Senior | 2 | Core services |
| Backend (Go) Middle | 3 | Services, integrations |
| Frontend (Next.js) Senior | 2 | Storefront, architecture |
| Frontend (Next.js) Middle | 2 | Dashboards, components |
| DevOps / SRE | 2 | Infra, CI/CD, monitoring |
| QA Engineer | 2 | Testing, automation |
| DBA | 1 | БД, оптимизация |
| Product Manager | 1 | Требования, приоритеты |
| UI/UX Designer | 1 | Дизайн, прототипы |
| **Итого** | **17** | |

### 11.2. Этапы

| Этап | Недели | Результат |
|------|--------|-----------|
| 1. Архитектура + DevOps | 1-6 | Инфраструктура, CI/CD, мониторинг |
| 2. Auth + Users | 7-10 | Регистрация, логин, RBAC |
| 3. Catalog + Search | 11-18 | Товары, категории, Elasticsearch |
| 4. Cart + Orders | 19-26 | Корзина, чекаут, заказы |
| 5. Payments | 27-32 | Stripe, split-payments |
| 6. Multi-Vendor | 33-38 | Vendor'ы, комиссии, payouts |
| 7. Frontend Storefront | 19-38 (параллельно) | Витрина, каталог, чекаут |
| 8. Frontend Dashboards | 33-44 | Admin, Vendor dashboards |
| 9. Notifications + Real-time | 39-44 | WebSockets, email, push |
| 10. Analytics | 45-48 | ClickHouse, отчёты |
| 11. Тестирование + Оптимизация | 49-52 | Нагрузочное, багфикс |
| **Итого** | **52 недели** | **Production-ready** |

---

## 12. БЮДЖЕТ (оценочный)

### 12.1. Инфраструктура (месяц)

| Компонент | Стоимость |
|-----------|-----------|
| EKS (Kubernetes) | $5,000 |
| PostgreSQL (RDS / managed) | $3,000 |
| Redis Cluster | $1,500 |
| Elasticsearch | $2,000 |
| Kafka | $2,000 |
| ClickHouse | $1,500 |
| MinIO / S3 | $1,000 |
| CDN (Cloudflare) | $500 |
| Vercel (Enterprise) | $2,000 |
| Monitoring (Datadog) | $2,000 |
| **Итого инфра** | **~$20,500/мес** |

### 12.2. Команда (месяц)

| Роль | Ставка | Месяц |
|------|--------|-------|
| 17 разработчиков | ~$8,000 avg | $136,000 |
| **Итого команда** | | **~$136,000/мес** |

### 12.3. Общий бюджет (12 месяцев)

| Статья | Сумма |
|--------|-------|
| Команда (12 мес) | $1,632,000 |
| Инфраструктура (12 мес) | $246,000 |
| Лицензии, SaaS | $50,000 |
| Буфер (20%) | $385,600 |
| **Итого** | **~$2,313,600** |

---

## 13. РИСКИ И МИТИГАЦИЯ

| Риск | Вероятность | Влияние | Митигация |
|------|------------|---------|-----------|
| Недостаточная производительность | Средняя | Высокое | Нагрузочное тестирование на каждом этапе |
| Vendor lock-in (Stripe) | Низкая | Среднее | Абстракция payment provider |
| Утечка данных | Низкая | Критическое | Аудит безопасности, encryption |
| Задержки с командой | Средняя | Высокое | Buffer time, параллельные задачи |
| Сложность multi-vendor | Средняя | Высокое | MVP single-store, затем multi-vendor |

---

## 14. ПРИЛОЖЕНИЯ

### Приложение А. Глоссарий

| Термин | Описание |
|--------|----------|
| Tenant | Изолированный экземпляр платформы (магазин) |
| Vendor | Независимый продавец в multi-vendor режиме |
| SKU | Stock Keeping Unit — уникальный идентификатор варианта товара |
| RLS | Row Level Security — изоляция данных на уровне строк |
| CQRS | Command Query Responsibility Segregation |
| Saga | Паттерн управления распределёнными транзакциями |

### Приложение Б. Ссылки

- [Next.js Documentation](https://nextjs.org/docs)
- [Go Documentation](https://golang.org/doc)
- [Citus Documentation](https://docs.citusdata.com)
- [Stripe Connect](https://stripe.com/connect)
- [Apache Kafka](https://kafka.apache.org)
- [Kubernetes](https://kubernetes.io/docs)

---

*Документ составлен: 15.07.2026*
*Версия: 1.0*
*Статус: Утверждено*
