import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Cada intento de verificación de una cuenta de Discord.
 * Guarda el resultado del análisis antifraude y si se entregó el rol.
 */
export const verifications = mysqlTable("verifications", {
  id: int("id").autoincrement().primaryKey(),
  /** Identificador público del intento (se usa para mostrar el resultado). */
  ticket: varchar("ticket", { length: 24 }).notNull().unique(),

  /** Datos de la cuenta de Discord. */
  discordId: varchar("discordId", { length: 32 }),
  username: varchar("username", { length: 64 }),
  globalName: varchar("globalName", { length: 96 }),
  avatar: varchar("avatar", { length: 160 }),
  email: varchar("email", { length: 320 }),
  accountCreatedAt: timestamp("accountCreatedAt"),
  accountAgeDays: int("accountAgeDays"),

  /** Resultado. */
  status: mysqlEnum("status", ["pending", "approved", "blocked", "error"])
    .default("pending")
    .notNull(),
  decision: mysqlEnum("decision", ["allow", "block"]).default("block").notNull(),
  riskScore: int("riskScore").default(0).notNull(),
  /** Lista JSON de motivos (código + texto + puntaje). */
  reasons: text("reasons"),
  errorMessage: varchar("errorMessage", { length: 255 }),

  /** Señales de red. */
  ip: varchar("ip", { length: 64 }),
  ipCountry: varchar("ipCountry", { length: 8 }),
  ipCity: varchar("ipCity", { length: 96 }),
  ipIsp: varchar("ipIsp", { length: 128 }),
  ipTimezone: varchar("ipTimezone", { length: 64 }),
  ipProxy: boolean("ipProxy").default(false).notNull(),
  ipHosting: boolean("ipHosting").default(false).notNull(),
  vpnDetected: boolean("vpnDetected").default(false).notNull(),
  privateIp: boolean("privateIp").default(false).notNull(),

  /** Señales del cliente. */
  clientTimezone: varchar("clientTimezone", { length: 64 }),
  fingerprint: varchar("fingerprint", { length: 64 }),
  userAgent: varchar("userAgent", { length: 255 }),

  /** Señales de multicuenta. */
  sameIpAccounts: int("sameIpAccounts").default(0).notNull(),
  sameFingerprintAccounts: int("sameFingerprintAccounts").default(0).notNull(),

  /** Entrega del acceso. */
  guildJoined: boolean("guildJoined").default(false).notNull(),
  roleGranted: boolean("roleGranted").default(false).notNull(),
  demo: boolean("demo").default(false).notNull(),

    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    ipIdx: index("idx_verifications_ip").on(table.ip),
    fingerprintIdx: index("idx_verifications_fingerprint").on(table.fingerprint),
    discordIdIdx: index("idx_verifications_discord_id").on(table.discordId),
    statusIdx: index("idx_verifications_status").on(table.status),
    createdAtIdx: index("idx_verifications_created_at").on(table.createdAt),
  }),
);

export type Verification = typeof verifications.$inferSelect;
export type InsertVerification = typeof verifications.$inferInsert;

/** Bitácora de cada paso del proceso, útil para auditar bloqueos. */
export const verificationEvents = mysqlTable("verification_events", {
  id: int("id").autoincrement().primaryKey(),
  verificationId: int("verificationId"),
  discordId: varchar("discordId", { length: 32 }),
  type: varchar("type", { length: 32 }).notNull(),
  message: text("message"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VerificationEvent = typeof verificationEvents.$inferSelect;

/**
 * Ajustes del bot editables desde el panel de administración.
 *
 * Se guardan como filas «clave = valor» para poder añadir ajustes nuevos sin
 * tocar la base de datos. Los valores llegan como texto y se convierten al
 * tipo correcto al leerlos.
 */
export const botSettings = mysqlTable("bot_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BotSetting = typeof botSettings.$inferSelect;

/**
 * Cuentas bloqueadas o aprobadas a mano desde el panel.
 *
 * Un bloqueo manual impide verificar aunque el análisis automático diga que
 * todo está bien; una aprobación manual (override) permite pasar aunque el
 * análisis haya bloqueado, para casos legítimos como una VPN de empresa.
 */
export const botBlocks = mysqlTable(
  "bot_blocks",
  {
    id: int("id").autoincrement().primaryKey(),
    discordId: varchar("discordId", { length: 32 }).notNull(),
    username: varchar("username", { length: 64 }),
    /** «block» lo bloquea; «allow» lo aprueba a mano. */
    kind: mysqlEnum("kind", ["block", "allow"]).default("block").notNull(),
    reason: varchar("reason", { length: 255 }),
    createdBy: varchar("createdBy", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    discordIdIdx: index("idx_bot_blocks_discord_id").on(table.discordId),
    kindIdx: index("idx_bot_blocks_kind").on(table.kind),
  }),
);
export type BotBlock = typeof botBlocks.$inferSelect;
export type InsertBotBlock = typeof botBlocks.$inferInsert;

/** Bitácora de todo lo que se hace desde el panel del bot (quién y qué). */
export const botActions = mysqlTable(
  "bot_actions",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Acción realizada: «settings.update», «member.role.add», etc. */
    action: varchar("action", { length: 64 }).notNull(),
    /** A quién afecta (ID de Discord, canal, rol…), si aplica. */
    target: varchar("target", { length: 96 }),
    detail: text("detail"),
    /** Resultado de la acción. */
    ok: boolean("ok").default(true).notNull(),
    error: varchar("error", { length: 255 }),
    createdBy: varchar("createdBy", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    actionIdx: index("idx_bot_actions_action").on(table.action),
    createdAtIdx: index("idx_bot_actions_created_at").on(table.createdAt),
  }),
);
export type BotAction = typeof botActions.$inferSelect;

/**
 * Cuentas con acceso al panel privado.
 *
 * La cuenta principal (la del propietario) vive en las variables de entorno y
 * siempre funciona. El resto son cuentas que se crean desde el panel para dar
 * acceso a personas concretas: cada una tiene su propio usuario y contraseña,
 * se puede desactivar en cualquier momento y queda registrada.
 */
export const panelAccounts = mysqlTable(
  "panel_accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Nombre de usuario para entrar. */
    username: varchar("username", { length: 64 }).notNull().unique(),
    /** Contraseña cifrada (scrypt con sal). Nunca se guarda en claro. */
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    /** Para quién es el acceso, por ejemplo «Juan · moderador». */
    label: varchar("label", { length: 96 }),
    /** «owner» puede todo; «moderator» gestiona miembros pero no los ajustes. */
    role: mysqlEnum("role", ["owner", "moderator"]).default("moderator").notNull(),
    /** Si se desactiva, la persona deja de poder entrar al instante. */
    active: boolean("active").default(true).notNull(),
    createdBy: varchar("createdBy", { length: 64 }),
    lastLoginAt: timestamp("lastLoginAt"),
    loginCount: int("loginCount").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    activeIdx: index("idx_panel_accounts_active").on(table.active),
  }),
);
export type PanelAccount = typeof panelAccounts.$inferSelect;
export type InsertPanelAccount = typeof panelAccounts.$inferInsert;

/** Registro de entradas al panel: quién, desde dónde y si acertó. */
export const panelLogins = mysqlTable(
  "panel_logins",
  {
    id: int("id").autoincrement().primaryKey(),
    username: varchar("username", { length: 64 }).notNull(),
    ok: boolean("ok").default(false).notNull(),
    ip: varchar("ip", { length: 64 }),
    country: varchar("country", { length: 8 }),
    userAgent: varchar("userAgent", { length: 255 }),
    /** Motivo cuando el intento fue rechazado. */
    reason: varchar("reason", { length: 160 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    usernameIdx: index("idx_panel_logins_username").on(table.username),
    createdAtIdx: index("idx_panel_logins_created_at").on(table.createdAt),
  }),
);
export type PanelLogin = typeof panelLogins.$inferSelect;
