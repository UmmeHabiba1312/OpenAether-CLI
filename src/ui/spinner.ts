import spinners from "cli-spinners";
import { stdout as stdoutWrite } from "node:process";

type SpinnerFrame = {
  interval: number;
  frames: string[];
};

/**
 * Simple terminal spinner for showing loading states.
 */
export class Spinner {
  private frames: string[];
  private interval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private currentFrame = 0;
  private message = "";
  private spinnerObj: SpinnerFrame;

  constructor() {
    this.spinnerObj = spinners.dots;
    this.frames = this.spinnerObj.frames;
    this.interval = this.spinnerObj.interval;
  }

  start(message = ""): void {
    this.message = message;
    this.currentFrame = 0;

    if (this.timer) return;

    // Write initial frame
    this.write();

    this.timer = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      this.write();
    }, this.interval);
  }

  setMessage(message: string): void {
    this.message = message;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Clear the spinner line
    this.clear();
  }

  succeed(message?: string): void {
    this.stop();
    if (message) {
      process.stdout.write(`\r✓ ${message}\n`);
    }
  }

  fail(message?: string): void {
    this.stop();
    if (message) {
      process.stdout.write(`\r✗ ${message}\n`);
    }
  }

  private write(): void {
    const frame = this.frames[this.currentFrame];
    const text = this.message ? ` ${this.message}` : "";
    process.stdout.write(`\r${frame}${text}`);
  }

  private clear(): void {
    process.stdout.write("\r\x1b[K");
  }
}
