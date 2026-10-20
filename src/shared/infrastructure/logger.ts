export class Logger {
  constructor(private readonly context: string) {}

  log(message: string): void {
    console.log(`[${new Date().toISOString()}] [LOG] [${this.context}] ${message}`);
  }

  warn(message: string): void {
    console.warn(`[${new Date().toISOString()}] [WARN] [${this.context}] ${message}`);
  }

  error(message: string, trace?: string): void {
    console.error(
      `[${new Date().toISOString()}] [ERROR] [${this.context}] ${message}${trace ? `\n${trace}` : ''}`,
    );
  }

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.debug(`[${new Date().toISOString()}] [DEBUG] [${this.context}] ${message}`);
    }
  }
}
