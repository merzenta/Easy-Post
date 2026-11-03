import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelValue: number;
  correlationId?: string;
  instanceId?: string;
  action: string;
  message?: string;
  module?: string;
  durationMs?: number;
  error?: {
    name?: string;
    message: string;
    stack?: string;
    httpStatus?: number;
    errorCode?: string;
  };
  context?: Record<string, any>;
}

export interface RequestLogEntry {
  timestamp?: string;
  correlationId?: string;
  instanceId?: string;
  method: string;
  path: string;
  url?: string;
  query?: Record<string, any>;
  headers?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  body?: any;
  statusCode?: number;
  durationMs?: number;
  error?: string;
  responseSize?: number;
  responseSummary?: Record<string, any>;
  context?: Record<string, any>;
}

// -------------------------------------------------------------
// Sensitive Field Redaction Engine
// -------------------------------------------------------------
const REDACTED_KEYS = new Set([
  'apikey',
  'apipassword',
  'pacapikey',
  'password',
  'secret',
  'wixappsecret',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'creditcard',
  'cardnumber',
  'cvv',
  'cvc',
  'apikeyencrypted',
  'apipasswordencrypted',
  'pacapikeyencrypted',
  'x-wix-signature',
  'signature',
  'session',
  'sessionid',
  'sessiontoken',
  'auth',
]);

export function redactSensitiveData(obj: any, depth = 0): any {
  if (depth > 10 || obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (REDACTED_KEYS.has(lowerKey)) {
      result[key] = '[REDACTED]';
    } else if (lowerKey === 'accountnumber' && typeof value === 'string') {
      result[key] = value.length > 4 ? `******${value.slice(-4)}` : '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactSensitiveData(value, depth + 1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// -------------------------------------------------------------
// Asynchronous Rotating File Stream Manager
// -------------------------------------------------------------
interface StreamTarget {
  fileName: string;
  currentDateStr: string;
  bytesWritten: number;
}

export class RotatingLogManager {
  private baseDir: string;
  private archiveDir: string;
  private maxSizeBytes: number;
  private maxRetentionDays: number;
  private isFilesystemAvailable = true;
  private targets: Map<string, StreamTarget> = new Map();

  constructor(logDir = path.join(process.cwd(), 'logs'), maxSizeMb = 20, maxRetentionDays = 30) {
    this.baseDir = logDir;
    this.archiveDir = path.join(logDir, 'archive');
    this.maxSizeBytes = maxSizeMb * 1024 * 1024;
    this.maxRetentionDays = maxRetentionDays;

    this.initDirectories();
    this.initTargets();
  }

  private initDirectories() {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
      }
    } catch {
      // Ephemeral or read-only serverless environment fallback
      this.isFilesystemAvailable = false;
    }
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private initTargets() {
    if (!this.isFilesystemAvailable) return;

    const files = [
      { name: 'combined', fileName: 'app-combined.log' },
      { name: 'error', fileName: 'app-error.log' },
      { name: 'spi', fileName: 'spi-rates.log' },
      { name: 'audit', fileName: 'audit.log' },
      { name: 'requests', fileName: 'requests.log' },
    ];

    const today = this.getTodayDateString();

    for (const f of files) {
      const fullPath = path.join(this.baseDir, f.fileName);
      let initialBytes = 0;
      try {
        if (fs.existsSync(fullPath)) {
          initialBytes = fs.statSync(fullPath).size;
        }
      } catch {
        initialBytes = 0;
      }

      this.targets.set(f.name, {
        fileName: f.fileName,
        currentDateStr: today,
        bytesWritten: initialBytes,
      });
    }
  }

  private rotateTarget(targetName: string, target: StreamTarget) {
    if (!this.isFilesystemAvailable) return;
    const currentPath = path.join(this.baseDir, target.fileName);

    try {
      if (fs.existsSync(currentPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = target.fileName.replace(/\.log$/, '');
        const archivePath = path.join(this.archiveDir, `${baseName}-${timestamp}.log.gz`);

        const raw = fs.readFileSync(currentPath);
        if (raw.length > 0) {
          const compressed = zlib.gzipSync(raw);
          fs.writeFileSync(archivePath, compressed);
        }

        // Truncate current active log file
        fs.writeFileSync(currentPath, '');
      }

      target.currentDateStr = this.getTodayDateString();
      target.bytesWritten = 0;

      this.pruneOldArchives();
    } catch (err) {
      console.error(`[Logger] Failed to rotate log file ${target.fileName}:`, err);
    }
  }

  private pruneOldArchives() {
    try {
      if (!fs.existsSync(this.archiveDir)) return;
      const files = fs.readdirSync(this.archiveDir);
      const now = Date.now();
      const maxAgeMs = this.maxRetentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const fullPath = path.join(this.archiveDir, file);
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(fullPath);
        }
      }
    } catch {
      // Ignore background pruning errors
    }
  }

  public writeTo(targetName: string, line: string) {
    if (!this.isFilesystemAvailable) return;
    const target = this.targets.get(targetName);
    if (!target) return;

    const today = this.getTodayDateString();
    const lineByteLength = Buffer.byteLength(line, 'utf8');

    // Check if rotation needed (date change or size limit exceeded)
    if (
      today !== target.currentDateStr ||
      (target.bytesWritten > 0 && target.bytesWritten + lineByteLength > this.maxSizeBytes)
    ) {
      this.rotateTarget(targetName, target);
    }

    const fullPath = path.join(this.baseDir, target.fileName);
    try {
      fs.appendFileSync(fullPath, line, 'utf8');
      target.bytesWritten += lineByteLength;
    } catch {
      // In case append fails (e.g. read-only permissions), fallback gracefully
    }
  }

  public async flush(): Promise<void> {
    return Promise.resolve();
  }
}

// -------------------------------------------------------------
// Main Application Logger Implementation
// -------------------------------------------------------------
export interface LoggerOptions {
  minLevel?: LogLevel;
  logDir?: string;
  defaultContext?: Record<string, any>;
  instanceId?: string;
  correlationId?: string;
  module?: string;
}

export class AppLogger {
  private minLevel: LogLevel;
  private manager: RotatingLogManager;
  private defaultContext: Record<string, any>;
  private instanceId?: string;
  private correlationId?: string;
  private module?: string;

  constructor(options: LoggerOptions = {}, manager?: RotatingLogManager) {
    this.minLevel = options.minLevel || (process.env.LOG_LEVEL as LogLevel) || 'info';
    this.manager = manager || new RotatingLogManager(options.logDir);
    this.defaultContext = options.defaultContext || {};
    this.instanceId = options.instanceId;
    this.correlationId = options.correlationId;
    this.module = options.module;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.minLevel];
  }

  private formatConsole(entry: LogEntry): string {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      return JSON.stringify(entry);
    }

    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m', // Green
      warn: '\x1b[33m', // Yellow
      error: '\x1b[31m', // Red
      fatal: '\x1b[35m', // Magenta
    };
    const reset = '\x1b[0m';
    const color = colors[entry.level] || '';
    const ctx = entry.context && Object.keys(entry.context).length > 0 ? ` ${JSON.stringify(entry.context)}` : '';
    const err = entry.error ? ` [Error: ${entry.error.message}]` : '';
    const corr = entry.correlationId ? ` (${entry.correlationId})` : '';

    return `${entry.timestamp} ${color}${entry.level.toUpperCase()}${reset} [${entry.action}]${corr}: ${entry.message || ''}${ctx}${err}`;
  }

  public log(entry: Omit<LogEntry, 'timestamp' | 'levelValue'> & { level: LogLevel }): void {
    if (!this.shouldLog(entry.level)) return;

    const fullEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: entry.level,
      levelValue: LOG_LEVEL_VALUES[entry.level],
      instanceId: entry.instanceId || this.instanceId,
      correlationId: entry.correlationId || this.correlationId,
      module: entry.module || this.module,
      action: entry.action,
      message: entry.message,
      durationMs: entry.durationMs,
      error: entry.error,
      context: redactSensitiveData({ ...this.defaultContext, ...(entry.context || {}) }),
    };

    const ndjsonLine = JSON.stringify(fullEntry) + '\n';

    // 1. Write to stdout / console
    const formatted = this.formatConsole(fullEntry);
    if (entry.level === 'error' || entry.level === 'fatal') {
      console.error(formatted);
    } else if (entry.level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // 2. Write to combined log
    this.manager.writeTo('combined', ndjsonLine);

    // 3. Write to error log if error/fatal
    if (entry.level === 'error' || entry.level === 'fatal') {
      this.manager.writeTo('error', ndjsonLine);
    }
  }

  public debug(action: string, message?: string, context?: Record<string, any>, durationMs?: number) {
    this.log({ level: 'debug', action, message, context, durationMs });
  }

  public info(action: string, message?: string, context?: Record<string, any>, durationMs?: number) {
    this.log({ level: 'info', action, message, context, durationMs });
  }

  public warn(action: string, message?: string, context?: Record<string, any>, durationMs?: number) {
    this.log({ level: 'warn', action, message, context, durationMs });
  }

  public error(action: string, message: string, err?: any, context?: Record<string, any>, durationMs?: number) {
    let errorDetails: LogEntry['error'] = undefined;
    if (err) {
      errorDetails = {
        name: err.name || 'Error',
        message: err.message || String(err),
        stack: err.stack,
        httpStatus: err.httpStatus || err.status,
        errorCode: err.errorCode || err.code,
      };
    }
    this.log({ level: 'error', action, message, error: errorDetails, context, durationMs });
  }

  public fatal(action: string, message: string, err?: any, context?: Record<string, any>) {
    let errorDetails: LogEntry['error'] = undefined;
    if (err) {
      errorDetails = {
        name: err.name || 'FatalError',
        message: err.message || String(err),
        stack: err.stack,
        httpStatus: err.httpStatus,
        errorCode: err.errorCode,
      };
    }
    this.log({ level: 'fatal', action, message, error: errorDetails, context });
  }

  /**
   * Dedicated audit log for Wix Checkout Rate calculations
   */
  public rateAudit(action: string, context: Record<string, any>, durationMs?: number) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      levelValue: LOG_LEVEL_VALUES.info,
      instanceId: this.instanceId,
      correlationId: this.correlationId,
      module: this.module || 'api/shipping-rates/v1/getRates',
      action,
      durationMs,
      context: redactSensitiveData({ ...this.defaultContext, ...context }),
    };

    const line = JSON.stringify(entry) + '\n';
    this.manager.writeTo('spi', line);
    this.manager.writeTo('combined', line);
  }

  /**
   * Dedicated financial/legal audit log (Manifests, Consignment Voids, Credential edits)
   */
  public audit(action: string, message: string, context?: Record<string, any>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      levelValue: LOG_LEVEL_VALUES.info,
      instanceId: this.instanceId,
      correlationId: this.correlationId,
      module: this.module,
      action,
      message,
      context: redactSensitiveData({ ...this.defaultContext, ...(context || {}) }),
    };

    const line = JSON.stringify(entry) + '\n';
    this.manager.writeTo('audit', line);
    this.manager.writeTo('combined', line);
    console.log(`[AUDIT] ${action}: ${message}`);
  }

  /**
   * Dedicated log for HTTP requests, payloads, query parameters, status codes, and latency
   */
  public logRequest(entry: RequestLogEntry): void {
    const timestamp = entry.timestamp || new Date().toISOString();
    const correlationId =
      entry.correlationId || this.correlationId || `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const instanceId = entry.instanceId || this.instanceId;

    const fullEntry: RequestLogEntry = {
      timestamp,
      correlationId,
      instanceId,
      method: (entry.method || 'GET').toUpperCase(),
      path: entry.path,
      url: entry.url,
      query: entry.query ? redactSensitiveData(entry.query) : undefined,
      headers: entry.headers ? redactSensitiveData(entry.headers) : undefined,
      ip: entry.ip,
      userAgent: entry.userAgent,
      body: entry.body !== undefined ? redactSensitiveData(entry.body) : undefined,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      error: entry.error,
      responseSize: entry.responseSize,
      responseSummary: entry.responseSummary ? redactSensitiveData(entry.responseSummary) : undefined,
      context: entry.context ? redactSensitiveData({ ...this.defaultContext, ...entry.context }) : undefined,
    };

    const line = JSON.stringify(fullEntry) + '\n';
    this.manager.writeTo('requests', line);
    this.manager.writeTo('combined', line);

    const statusStr = fullEntry.statusCode ? ` -> ${fullEntry.statusCode}` : '';
    const durationStr = fullEntry.durationMs !== undefined ? ` (${fullEntry.durationMs}ms)` : '';
    const ipStr = fullEntry.ip ? ` [${fullEntry.ip}]` : '';
    console.log(`${timestamp} HTTP [${fullEntry.method}] ${fullEntry.path}${statusStr}${durationStr}${ipStr}`);
  }

  /**
   * Create a child logger with bound module, instanceId, or correlationId
   */
  public child(bindings: {
    instanceId?: string;
    correlationId?: string;
    module?: string;
    defaultContext?: Record<string, any>;
  }): AppLogger {
    return new AppLogger(
      {
        minLevel: this.minLevel,
        instanceId: bindings.instanceId || this.instanceId,
        correlationId: bindings.correlationId || this.correlationId,
        module: bindings.module || this.module,
        defaultContext: { ...this.defaultContext, ...(bindings.defaultContext || {}) },
      },
      this.manager,
    );
  }

  public async flush(): Promise<void> {
    await this.manager.flush();
  }
}

// Global Singleton Application Logger
export const logger = new AppLogger();

/**
 * Creates a child logger bound to a specific tenant installation and correlation ID
 */
export function createTenantLogger(
  instanceId: string,
  correlationId?: string,
  defaultContext?: Record<string, any>,
  module?: string,
  customLogger: AppLogger = logger,
): AppLogger {
  const generatedTrace = correlationId || `trace-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  return customLogger.child({
    instanceId,
    correlationId: generatedTrace,
    module,
    defaultContext,
  });
}

export default logger;
