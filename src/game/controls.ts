import type { Input } from "../oryn/input";

/** Template input plus what this game adds: Shift to sink, mouse capture, and a click that grabs while captured. */
export class Controls {
  thrust = 0;
  turn = 0;
  rise = 0;
  lookX = 0;
  lookY = 0;
  grab = false;
  sonar = false;
  pause = false;
  /** Anything at all was pressed this frame or since the start. */
  touched = false;
  enabled = true;
  private codes = new Set<string>();
  private pressed = new Set<string>();

  constructor(private input: Input, private canvas: HTMLCanvasElement) {
    window.addEventListener("keydown", (event) => {
      if (!event.repeat) this.pressed.add(event.code);
      this.codes.add(event.code);
      if (event.code.startsWith("Shift") || event.code === "Tab") event.preventDefault();
      this.touched = true;
    });
    window.addEventListener("keyup", (event) => this.codes.delete(event.code));
    window.addEventListener("blur", () => this.codes.clear());
    window.addEventListener("pointerdown", () => (this.touched = true));
    canvas.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "mouse" || !this.enabled) return;
      if (document.pointerLockElement === canvas) this.pressed.add("Click");
      else if (event.button === 0) void Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
    });
  }

  release() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  update() {
    const { input } = this;
    const held = (code: string) => this.codes.has(code);
    const hit = (code: string) => this.pressed.has(code);
    const axis = input.axis();
    this.thrust = axis.y;
    this.turn = axis.x;
    this.rise = (input.held("jump") ? 1 : 0) - (held("ShiftLeft") || held("ShiftRight") || held("KeyC") || input.held("secondary") ? 1 : 0);
    if (input.device === "keyboard" && input.held("secondary") && !held("KeyQ") && !held("ShiftLeft")) this.rise = input.held("jump") ? 1 : held("KeyC") ? -1 : 0;
    const look = input.look();
    this.lookX = look.x;
    this.lookY = look.y;
    const other = input.device !== "keyboard";
    this.grab = hit("KeyE") || hit("Click") || (other && input.pressed("interact"));
    this.sonar = hit("KeyF") || (other && input.pressed("action"));
    this.pause = input.pressed("pause");
    if (input.device === "gamepad") this.touched = true;
    this.pressed.clear();
    if (!this.enabled) {
      this.thrust = this.turn = this.rise = this.lookX = this.lookY = 0;
      this.grab = this.sonar = false;
    }
  }
}
