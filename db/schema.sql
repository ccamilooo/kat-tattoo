-- ============================================================
--  KAT TATTOO STUDIO - ESQUEMA DE BASE DE DATOS (PostgreSQL)
--  IDs de texto con prefijo generados por trigger (ej. ART-0001)
-- ============================================================

-- Extensión para funciones criptográficas (hash) y utilidades
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------
-- 0) FUNCIÓN GENÉRICA DE GENERACIÓN DE IDs
--    Cada tabla usa una secuencia llamada <tabla>_id_seq y un prefijo.
--    appointments -> APT-<año>-0001, el resto -> <PREFIJO>-0001
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_set_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        DECLARE
            seq    text := TG_TABLE_NAME || '_id_seq';
            prefix text;
            num    text;
        BEGIN
            IF NEW.id IS NULL OR NEW.id = '' THEN
                prefix := CASE TG_TABLE_NAME
                    WHEN 'activity_log'      THEN 'LOG-'
                    WHEN 'ai_conversations'  THEN 'CONV-'
                    WHEN 'ai_messages'       THEN 'AMSG-'
                    WHEN 'appointments'      THEN 'APT-' || to_char(now(),'YYYY') || '-'
                    WHEN 'artist_schedules'  THEN 'SCH-'
                    WHEN 'artists'           THEN 'ART-'
                    WHEN 'clients'           THEN 'CLI-'
                    WHEN 'design_proposals'  THEN 'DPR-'
                    WHEN 'gallery'           THEN 'GAL-'
                    WHEN 'messages'          THEN 'MSG-'
                    WHEN 'notifications'     THEN 'NTF-'
                    WHEN 'services'          THEN 'SVC-'
                    WHEN 'session_notes'     THEN 'NOTE-'
                    WHEN 'user_references'   THEN 'REF-'
                    WHEN 'users'             THEN 'USR-'
                    ELSE TG_TABLE_NAME || '-'
                END;
                EXECUTE format('SELECT lpad(nextval(%L)::text, 4, %L)', seq, '0') INTO num;
                NEW.id := prefix || num;
            END IF;
            RETURN NEW;
        END $$;

-- ------------------------------------------------------------------
-- 1) ARTISTAS
-- ------------------------------------------------------------------
CREATE TABLE public.artists (
    id           text NOT NULL,
    name         VARCHAR(120) NOT NULL,
    specialty    VARCHAR(120),
    bio          TEXT,
    image_url    TEXT,
    instagram    VARCHAR(120),
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.artists_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.artists_id_seq OWNED BY public.artists.id;
ALTER TABLE ONLY public.artists ADD CONSTRAINT artists_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------------
-- 2) GALERÍA DE TATUAJES
-- ------------------------------------------------------------------
CREATE TABLE public.gallery (
    id           text NOT NULL,
    title        VARCHAR(160) NOT NULL,
    category     VARCHAR(80) NOT NULL,
    description  TEXT,
    image_url    TEXT NOT NULL,
    price_from   NUMERIC(10,2),
    artist_id    text,
    is_featured  BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.gallery_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.gallery_id_seq OWNED BY public.gallery.id;
ALTER TABLE ONLY public.gallery ADD CONSTRAINT gallery_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.gallery ADD CONSTRAINT gallery_artist_id_fkey
    FOREIGN KEY (artist_id) REFERENCES public.artists(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 3) SERVICIOS
-- ------------------------------------------------------------------
CREATE TABLE public.services (
    id               text NOT NULL,
    name             VARCHAR(120) NOT NULL,
    description      TEXT,
    base_price       NUMERIC(10,2) NOT NULL DEFAULT 0,
    duration_minutes integer,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    image_url        VARCHAR(255),
    display_order    integer DEFAULT 0
);
CREATE SEQUENCE public.services_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.services_id_seq OWNED BY public.services.id;
ALTER TABLE ONLY public.services ADD CONSTRAINT services_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------------
-- 4) CLIENTES
-- ------------------------------------------------------------------
CREATE TABLE public.clients (
    id           text NOT NULL,
    name         VARCHAR(120) NOT NULL,
    email        VARCHAR(160),
    phone        VARCHAR(40),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.clients_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;
ALTER TABLE ONLY public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------------
-- 5) CITAS / RESERVAS
-- ------------------------------------------------------------------
CREATE TABLE public.appointments (
    id                text NOT NULL,
    client_id         text,
    service_id        text,
    artist_id         text,
    appointment_date  TIMESTAMPTZ NOT NULL,
    status            VARCHAR(30) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','completed','cancelled')),
    notes             TEXT,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.appointments_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.appointments_id_seq OWNED BY public.appointments.id;
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_service_id_fkey
    FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.appointments ADD CONSTRAINT appointments_artist_id_fkey
    FOREIGN KEY (artist_id) REFERENCES public.artists(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 6) MENSAJES DE CONTACTO
-- ------------------------------------------------------------------
CREATE TABLE public.messages (
    id           text NOT NULL,
    name         VARCHAR(120) NOT NULL,
    email        VARCHAR(160) NOT NULL,
    phone        VARCHAR(40),
    subject      VARCHAR(200),
    message      TEXT NOT NULL,
    is_read      BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.messages_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.messages_id_seq OWNED BY public.messages.id;
ALTER TABLE ONLY public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);

-- ------------------------------------------------------------------
-- 7) CONVERSACIONES DEL ASISTENTE IA
-- ------------------------------------------------------------------
CREATE TABLE public.ai_conversations (
    id           text NOT NULL,
    session_id   VARCHAR(80) NOT NULL,
    client_id    text,
    title        VARCHAR(200) DEFAULT 'Nueva conversación',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.ai_conversations_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.ai_conversations_id_seq OWNED BY public.ai_conversations.id;
ALTER TABLE ONLY public.ai_conversations ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_conversations ADD CONSTRAINT ai_conversations_session_id_key UNIQUE (session_id);
ALTER TABLE ONLY public.ai_conversations ADD CONSTRAINT ai_conversations_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 8) MENSAJES DEL ASISTENTE IA
-- ------------------------------------------------------------------
CREATE TABLE public.ai_messages (
    id               text NOT NULL,
    conversation_id  text NOT NULL,
    role             VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','system')),
    content          TEXT NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.ai_messages_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.ai_messages_id_seq OWNED BY public.ai_messages.id;
ALTER TABLE ONLY public.ai_messages ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_messages ADD CONSTRAINT ai_messages_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 9) USUARIOS DEL SISTEMA (login/roles: admin, artist, client)
-- ------------------------------------------------------------------
CREATE TABLE public.users (
    id            text NOT NULL,
    email         VARCHAR(160) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'client'
                  CHECK (role IN ('admin','artist','client')),
    artist_id     text,
    client_id     text,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW(),
    reset_code    VARCHAR(10),
    reset_expires TIMESTAMPTZ
);
CREATE SEQUENCE public.users_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_artist_id_fkey
    FOREIGN KEY (artist_id) REFERENCES public.artists(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.users ADD CONSTRAINT users_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 10) REFERENCIAS SUBIDAS POR EL CLIENTE (RF04)
-- ------------------------------------------------------------------
CREATE TABLE public.user_references (
    id           text NOT NULL,
    user_id      text NOT NULL,
    image_url    TEXT NOT NULL,
    description  TEXT,
    analysis     TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.user_references_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.user_references_id_seq OWNED BY public.user_references.id;
ALTER TABLE ONLY public.user_references ADD CONSTRAINT user_references_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.user_references ADD CONSTRAINT user_references_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 11) PROPUESTAS DE DISEÑO GENERADAS (RF06)
-- ------------------------------------------------------------------
CREATE TABLE public.design_proposals (
    id            text NOT NULL,
    reference_id  text NOT NULL,
    content       TEXT NOT NULL,
    image_url     TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.design_proposals_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.design_proposals_id_seq OWNED BY public.design_proposals.id;
ALTER TABLE ONLY public.design_proposals ADD CONSTRAINT design_proposals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.design_proposals ADD CONSTRAINT design_proposals_reference_id_fkey
    FOREIGN KEY (reference_id) REFERENCES public.user_references(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 12) HORARIOS / DISPONIBILIDAD DE ARTISTAS (RF16)
-- ------------------------------------------------------------------
CREATE TABLE public.artist_schedules (
    id           text NOT NULL,
    artist_id    text NOT NULL,
    day_of_week  integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domingo
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (artist_id, day_of_week, start_time, end_time)
);
CREATE SEQUENCE public.artist_schedules_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.artist_schedules_id_seq OWNED BY public.artist_schedules.id;
ALTER TABLE ONLY public.artist_schedules ADD CONSTRAINT artist_schedules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.artist_schedules ADD CONSTRAINT artist_schedules_artist_id_fkey
    FOREIGN KEY (artist_id) REFERENCES public.artists(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 13) NOTAS / AVANCES DE SESIÓN (RF20)
-- ------------------------------------------------------------------
CREATE TABLE public.session_notes (
    id             text NOT NULL,
    appointment_id text NOT NULL,
    artist_id      text,
    notes          TEXT NOT NULL,
    progress_pct   integer CHECK (progress_pct BETWEEN 0 AND 100),
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.session_notes_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.session_notes_id_seq OWNED BY public.session_notes.id;
ALTER TABLE ONLY public.session_notes ADD CONSTRAINT session_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.session_notes ADD CONSTRAINT session_notes_appointment_id_fkey
    FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.session_notes ADD CONSTRAINT session_notes_artist_id_fkey
    FOREIGN KEY (artist_id) REFERENCES public.artists(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 14) NOTIFICACIONES (RF12)
-- ------------------------------------------------------------------
CREATE TABLE public.notifications (
    id         text NOT NULL,
    user_id    text,
    type       VARCHAR(40) NOT NULL DEFAULT 'info',
    title      VARCHAR(200) NOT NULL,
    message    TEXT,
    is_read    BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.notifications_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.notifications_id_seq OWNED BY public.notifications.id;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- ------------------------------------------------------------------
-- 15) LOG DE AUDITORÍA / TRAZABILIDAD (RNF10)
-- ------------------------------------------------------------------
CREATE TABLE public.activity_log (
    id         text NOT NULL,
    user_id    text,
    action     VARCHAR(80) NOT NULL,
    entity     VARCHAR(80),
    entity_id  text,
    details    JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE SEQUENCE public.activity_log_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.activity_log_id_seq OWNED BY public.activity_log.id;
ALTER TABLE ONLY public.activity_log ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.activity_log ADD CONSTRAINT activity_log_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Índices para mejorar rendimiento
CREATE INDEX idx_gallery_category ON public.gallery (category);
CREATE INDEX idx_gallery_artist ON public.gallery (artist_id);
CREATE INDEX idx_appointments_date ON public.appointments (appointment_date);
CREATE INDEX idx_appointments_status ON public.appointments (status);
CREATE INDEX idx_messages_read ON public.messages (is_read);
CREATE INDEX idx_ai_messages_conv ON public.ai_messages (conversation_id);
CREATE INDEX idx_users_role ON public.users (role);
CREATE INDEX idx_refs_user ON public.user_references (user_id);
CREATE INDEX idx_schedules_artist ON public.artist_schedules (artist_id);
CREATE INDEX idx_session_notes_appt ON public.session_notes (appointment_id);
CREATE INDEX idx_notifs_user ON public.notifications (user_id);
CREATE INDEX idx_activity_user ON public.activity_log (user_id);

-- ------------------------------------------------------------------
-- TRIGGERS DE GENERACIÓN DE IDs (BEFORE INSERT)
-- ------------------------------------------------------------------
CREATE TRIGGER trg_id_artists          BEFORE INSERT ON public.artists          FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_gallery          BEFORE INSERT ON public.gallery          FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_services         BEFORE INSERT ON public.services         FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_clients          BEFORE INSERT ON public.clients          FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_appointments     BEFORE INSERT ON public.appointments     FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_messages         BEFORE INSERT ON public.messages         FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_ai_conversations BEFORE INSERT ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_ai_messages      BEFORE INSERT ON public.ai_messages      FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_users            BEFORE INSERT ON public.users            FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_user_references  BEFORE INSERT ON public.user_references  FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_design_proposals BEFORE INSERT ON public.design_proposals FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_artist_schedules BEFORE INSERT ON public.artist_schedules FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_session_notes    BEFORE INSERT ON public.session_notes    FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_notifications    BEFORE INSERT ON public.notifications    FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
CREATE TRIGGER trg_id_activity_log     BEFORE INSERT ON public.activity_log     FOR EACH ROW EXECUTE FUNCTION public.trg_set_id();
