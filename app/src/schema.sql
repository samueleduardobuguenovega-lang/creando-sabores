-- Esquema de la base de datos de Creando Sabores.
-- Se puede volver a ejecutar sin romper nada: todo va con IF NOT EXISTS.
-- El diagrama de referencia está en docs/modelo-datos.md.

CREATE TABLE IF NOT EXISTS usuario (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(120) NOT NULL,
  usuario     VARCHAR(60)  NOT NULL UNIQUE,
  clave_hash  TEXT         NOT NULL,
  rol         VARCHAR(20)  NOT NULL CHECK (rol IN ('admin', 'docente')),
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS taller (
  id                SERIAL PRIMARY KEY,
  nombre            VARCHAR(140) NOT NULL,
  tematica          VARCHAR(120) NOT NULL,
  descripcion       TEXT         NOT NULL DEFAULT '',
  fecha_planificada DATE,
  estado            VARCHAR(20)  NOT NULL DEFAULT 'planificado'
                    CHECK (estado IN ('planificado', 'en_ejecucion', 'finalizado')),
  id_usuario        INTEGER      NOT NULL REFERENCES usuario(id),
  creado_en         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Una receta es una ficha independiente (PDF) que se puede reutilizar
-- en varios talleres; por eso el vínculo vive en su propia tabla.
CREATE TABLE IF NOT EXISTS receta (
  id          SERIAL PRIMARY KEY,
  codigo      VARCHAR(40)  NOT NULL UNIQUE,
  nombre      VARCHAR(140) NOT NULL,
  descripcion TEXT         NOT NULL DEFAULT '',
  enlace_pdf  TEXT,
  id_usuario  INTEGER      NOT NULL REFERENCES usuario(id),
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receta_taller (
  id_receta INTEGER NOT NULL REFERENCES receta(id) ON DELETE CASCADE,
  id_taller INTEGER NOT NULL REFERENCES taller(id) ON DELETE CASCADE,
  PRIMARY KEY (id_receta, id_taller)
);

CREATE TABLE IF NOT EXISTS documento (
  id         SERIAL PRIMARY KEY,
  nombre     VARCHAR(160) NOT NULL,
  archivo    VARCHAR(200) NOT NULL,
  tipo_mime  VARCHAR(100) NOT NULL,
  tamano     INTEGER      NOT NULL,
  id_taller  INTEGER      REFERENCES taller(id) ON DELETE CASCADE,
  id_receta  INTEGER      REFERENCES receta(id) ON DELETE CASCADE,
  id_usuario INTEGER      NOT NULL REFERENCES usuario(id),
  creado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT documento_un_destino CHECK (
    (id_taller IS NOT NULL AND id_receta IS NULL)
    OR (id_taller IS NULL AND id_receta IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS video (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(160) NOT NULL,
  descripcion TEXT         NOT NULL DEFAULT '',
  enlace      TEXT         NOT NULL,
  proveedor   VARCHAR(20)  NOT NULL CHECK (proveedor IN ('youtube', 'vimeo')),
  id_taller   INTEGER      REFERENCES taller(id) ON DELETE CASCADE,
  id_receta   INTEGER      REFERENCES receta(id) ON DELETE CASCADE,
  id_usuario  INTEGER      NOT NULL REFERENCES usuario(id),
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT video_un_destino CHECK (
    (id_taller IS NOT NULL AND id_receta IS NULL)
    OR (id_taller IS NULL AND id_receta IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS ejecucion (
  id                     SERIAL PRIMARY KEY,
  fecha_ejecucion        DATE    NOT NULL,
  id_taller              INTEGER NOT NULL REFERENCES taller(id) ON DELETE CASCADE,
  cantidad_participantes INTEGER NOT NULL CHECK (cantidad_participantes >= 0),
  observaciones          TEXT,
  id_video               INTEGER REFERENCES video(id) ON DELETE SET NULL,
  id_usuario             INTEGER NOT NULL REFERENCES usuario(id),
  creado_en              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RNF: "Registro de modificaciones y acciones relevantes".
CREATE TABLE IF NOT EXISTS auditoria (
  id         SERIAL PRIMARY KEY,
  id_usuario INTEGER     REFERENCES usuario(id),
  accion     VARCHAR(40) NOT NULL,
  entidad    VARCHAR(40) NOT NULL,
  entidad_id INTEGER,
  detalle    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taller_estado ON taller (estado);
CREATE INDEX IF NOT EXISTS idx_taller_fecha ON taller (fecha_planificada);
CREATE INDEX IF NOT EXISTS idx_ejecucion_fecha ON ejecucion (fecha_ejecucion);
CREATE INDEX IF NOT EXISTS idx_ejecucion_taller ON ejecucion (id_taller);
CREATE INDEX IF NOT EXISTS idx_documento_taller ON documento (id_taller);
CREATE INDEX IF NOT EXISTS idx_video_taller ON video (id_taller);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (creado_en);
