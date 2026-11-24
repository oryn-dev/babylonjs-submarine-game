import "@babylonjs/core/Culling/ray";
import "@babylonjs/core/Physics/physicsEngineComponent";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Game, GameContext, GameMeta } from "../oryn/context";
import { onSettings, settings, updateSettings } from "../oryn/settings";
import { ChaseCamera } from "./camera";
import { Controls } from "./controls";
import { Tune } from "./data/tune";
import { SHIP, STATION, WRECKS } from "./data/wrecks";
import { Dive } from "./dive";
import { Ending } from "./ending";
import { el } from "./hud/dom";
import "./hud/hud.css";
import { Hud } from "./hud/hud";
import { icon } from "./hud/icons";
import type { Marker } from "./hud/markers";
import { Screens } from "./hud/screens";
import { Lesson } from "./lesson";
import { Save } from "./progress";
import { Sound } from "./sound";
import { zoneAt, ZONES } from "./world/height";
import { createWorld } from "./world/world";

export const meta: GameMeta = { title: "Deep Salvage" };

type State = "diving" | "docking" | "ship" | "menu" | "lost" | "ending";

const CRADLE = new Vector3(SHIP.x, -SHIP.cradle, SHIP.z);
const START = new Vector3(1.5, -14.6, 4.5);

export async function createGame(ctx: GameContext): Promise<Game> {
  const { scene, input, look, assets, metric } = ctx;
  const ui = document.querySelector<HTMLElement>("#oryn-ui")!;
  const font = new FontFace("Rubik DS", `url("${assets.url("fonts/Rubik.ttf")}")`, { weight: "300 900" });
  document.fonts.add(font);
  void font.load().catch(() => undefined);
  // The template's screen-space passes cost more than they show under water; its other effects stay.
  look.setPixel({ fxaa: true, msaa: true, bloom: true, sharpen: true, grain: true });
  onSettings(() => scene.getEngine().setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, { low: 0.75, medium: 1.35, high: 1.75 }[settings.quality])));

  const tune = new Tune(ctx.tuning);
  const chase = new ChaseCamera(scene, tune);
  const save = new Save(tune);
  const sound = new Sound(ctx.audio, assets);
  void sound.load();
  const [world, continued] = await Promise.all([createWorld(scene, assets, look, tune), save.load()]);
  const { sub, water, wrecks, cargo, glows } = world;
  scene.getMeshByName("sky")?.setEnabled(false);

  const controls = new Controls(input, ctx.canvas);
  const screens = new Screens(save, tune, sound);
  const fade = el("div", "ds-fade");
  let muted = settings.volume === 0 ? 0.8 : 0;
  const toggleSound = () => {
    if (muted) updateSettings({ volume: muted });
    const on = Boolean(muted);
    muted = on ? 0 : settings.volume || 0.8;
    if (!on) updateSettings({ volume: 0 });
    return on;
  };
  const hud = new Hud(input, { pause: () => pause(), sound: toggleSound });
  hud.setSound(!muted);
  ui.prepend(hud.root);
  ui.append(screens.root, fade);
  input.touch.configure({
    stick: true,
    buttons: [
      { action: "interact", label: "Grab", icon: icon("claw") },
      { action: "action", label: "Sonar", icon: icon("sonar") },
      { action: "jump", label: "Up", icon: icon("up") },
      { action: "secondary", label: "Down", icon: icon("down") },
    ],
  });

  let state: State = "diving";
  let titled = true;
  let zone = -1;
  let launched = 0;
  let resumeTo: State = "diving";
  const lesson = new Lesson(hud, save.data.lesson);
  const ending = new Ending(world, chase, sound);

  const setState = (next: State) => {
    state = next;
    const playing = next === "diving";
    controls.enabled = playing;
    input.touch.setEnabled(playing);
    hud.setVisible(playing);
    if (!playing) controls.release();
  };

  const dive = new Dive(world, save, tune, sound, {
    note: (text, kind) => hud.note(text, kind),
    hurt: (amount) => {
      hud.hit();
      chase.shake(Math.min(1, 0.3 + amount * 4));
    },
    stored: (item) => {
      hud.stored(dive.value);
      hud.note(`${item.stats.name}  +${item.stats.value}`, "gain");
      sound.play("coin", 0.4);
      lesson.done(1);
    },
    page: (page) => {
      resumeTo = state;
      setState("menu");
      save.store();
      screens.page(page.wreck, () => setState(resumeTo));
    },
    lost: (reason) => {
      const count = dive.hold.length;
      setState("lost");
      sound.play("groan", 0.8);
      fade.style.transition = "opacity 1.2s";
      fade.style.opacity = "1";
      setTimeout(() => {
        dive.drop();
        board(false);
        screens.lost(reason, count, () => ship(false));
        fade.style.opacity = "0";
      }, 1300);
    },
  });

  sub.onBump = (speed, point) => state === "diving" && dive.bump(speed, point);
  world.leviathan.onCall = (near) => sound.play(Math.random() < 0.5 ? "call1" : "call2", 0.3 + near * 0.6, 0.95 + Math.random() * 0.1);

  /** Into the cradle, at once. */
  const board = (count = true) => {
    sub.frozen = true;
    sub.teleport(CRADLE, 0);
    chase.yaw = 0;
    chase.pitch = 0.12;
    if (count) save.data.dives++;
    chase.shot = { from: CRADLE.add(new Vector3(8.2, -1.4, 10)), to: CRADLE.add(new Vector3(0, -3.6, 0.4)) };
  };

  const ship = (sell: boolean) => {
    setState("ship");
    const { sold, total } = sell ? dive.sell() : { sold: [], total: 0 };
    if (sell) lesson.done(3);
    save.data.lesson = lesson.step;
    save.store();
    screens.ship(sold, total, launch);
  };

  const launch = () => {
    dive.begin();
    hud.stored(0);
    chase.shot = null;
    sub.frozen = false;
    sub.velocity.setAll(0);
    sound.play("dock", 0.6, 0.85);
    launched = 1.6;
    zone = -1;
    setState("diving");
  };

  const dock = () => {
    setState("docking");
    dive.release();
    sound.play("dock", 0.8);
    sub.frozen = true;
    const from = sub.position.clone();
    const turn = sub.heading;
    let t = 0;
    const step = scene.onBeforeRenderObservable.add(() => {
      t = Math.min(1, t + scene.getEngine().getDeltaTime() / 1400);
      const k = t * t * (3 - 2 * t);
      sub.teleport(Vector3.Lerp(from, CRADLE, k), turn * (1 - k));
      if (t < 1) return;
      scene.onBeforeRenderObservable.remove(step);
      board();
      ship(true);
    });
  };

  const newGame = () => {
    save.reset();
    lesson.step = 0;
    cargo.reset([], []);
    wrecks.power = 0;
    world.leviathan.greeting = false;
    start(false);
  };

  const start = (fromShip: boolean) => {
    dive.begin();
    hud.stored(0);
    chase.shot = null;
    sub.frozen = false;
    sub.teleport(fromShip ? new Vector3(SHIP.x, -14, SHIP.z + 10) : START, fromShip ? 0.2 : 0.25);
    chase.yaw = sub.heading;
    chase.pitch = 0.16;
    chase.jump(sub.position);
    titled = true;
    hud.showTitle();
    zone = 0;
    setState("diving");
  };

  const pause = () => {
    if (state !== "diving") return;
    resumeTo = state;
    setState("menu");
    sound.play("click", 0.5);
    screens.pause(() => setState("diving"), newGame);
  };

  const finish = () => {
    setState("ending");
    dive.release();
    sub.frozen = true;
    save.data.finished = true;
    save.store();
    ending.play(() => screens.ending(() => {
      ending.leave();
      dive.begin();
      sub.frozen = false;
      setState("diving");
    }, () => {
      ending.leave();
      newGame();
    }));
  };

  cargo.reset(save.data.sold, save.data.pages);
  if (save.data.finished) {
    wrecks.power = 1;
    world.leviathan.greeting = true;
  }
  start(continued);

  const collar = wrecks.collar();
  const stationMark = new Vector3(STATION.x, -STATION.depth + 22, STATION.z);

  const markers = () => {
    const list: Marker[] = [{ key: "ship", position: new Vector3(SHIP.x, -SHIP.cradle, SHIP.z), kind: "ship", label: "Marlin" }];
    const deepEnough = dive.limit >= STATION.depth || save.data.pages.length >= WRECKS.length;
    if (!lesson.active || lesson.step > 2) {
      const page = dive.signal();
      if (page && !titled) list.push({ key: `signal-${page.wreck}`, position: page.position, kind: Vector3.Distance(page.position, sub.position) < 30 ? "page" : "signal", label: "Signal" });
    }
    if (deepEnough && !save.data.finished) list.push({ key: "station", position: stationMark, kind: "lantern", label: "Lantern Station" });
    if (lesson.step <= 1) {
      const first = cargo.items[cargo.items.length - 1];
      if (first.state === "lying" && Vector3.Distance(first.home, sub.position) < 60) list.push({ key: "first", position: first.home, kind: "cargo", label: first.stats.name });
    }
    const near = cargo.items.filter((item) => item.state === "lying" && item.marked > 0).sort((a, b) => Vector3.DistanceSquared(a.home, sub.position) - Vector3.DistanceSquared(b.home, sub.position));
    for (const item of near.slice(0, 6)) list.push({ key: item.id, position: item.home, kind: "cargo", label: item.stats.name });
    return list;
  };

  const prompts = (touch: boolean) => {
    const atShip = Vector3.Distance(sub.position, CRADLE) < tune.num("dock_range", 7.5) && launched <= 0;
    const atStation = !save.data.finished && Vector3.Distance(sub.position, collar) < 9;
    const found = dive.busy ? null : dive.candidate();
    if (controls.grab) {
      if (atStation) return finish();
      if (found && !(atShip && dive.hold.length)) dive.grab();
      else if (atShip && sub.velocity.length() < 6) return dock();
    }
    const worthDocking = atShip && (dive.hold.length > 0 || !found) && !(lesson.active && lesson.step < 3);
    if (atStation) hud.setPrompt(touch ? "Touch the claw to wake the lantern" : "Wake the lantern", { keyboard: "E", gamepad: "Y" });
    else if (worthDocking) hud.setPrompt(dive.hold.length ? "Dock and sell" : "Dock at the Marlin", { keyboard: "E", gamepad: "Y" });
    else if (lesson.active) lesson.show(touch);
    else if (found?.full) hud.setPrompt(`${found.item.stats.name}: the hold is full`);
    else if (found?.tooHeavy) hud.setPrompt(`${found.item.stats.name} needs arm level ${found.item.stats.arm}`);
    else if (found) hud.setPrompt(`${found.item.stats.name}, ${found.item.stats.slots === 1 ? "1 slot" : `${found.item.stats.slots} slots`}`, { keyboard: "E", gamepad: "Y" });
    else hud.setPrompt("");
  };

  const gauge = () => ({ depth: -sub.position.y, limit: dive.limit, power: dive.power, hull: dive.hull, slots: save.stat("hold"), used: dive.used, value: dive.value });

  const update = (dt: number) => {
    controls.update();
    const touch = input.device === "touch";
    const playing = state === "diving";
    if (controls.pause) {
      if (playing) pause();
      else if (state === "menu") screens.confirm();
    } else if (!playing && state !== "docking" && input.device === "gamepad" && input.pressed("jump")) screens.confirm();

    if (playing) {
      const k = tune.num("mouse_speed", 0.0026);
      chase.yaw += controls.turn * tune.num("turn_rate", 1.05) * dt + controls.lookX * k;
      chase.pitch += controls.lookY * k;
      if (Math.abs(controls.thrust) > 0.2 && touch) chase.pitch += (0.14 - chase.pitch) * dt * 0.25;
      save.data.seconds += dt;
      save.data.deepest = Math.max(save.data.deepest, -sub.position.y);
      if (titled && (Math.abs(controls.thrust) + Math.abs(controls.turn) + Math.abs(controls.rise) > 0.2 || controls.grab)) {
        titled = false;
        hud.hideTitle();
      }
      if (!titled && sub.velocity.length() > 1.4) lesson.done(0);
      launched = Math.max(0, launched - dt);
      if (controls.sonar && dive.ping()) lesson.done(2);
      prompts(touch);
      const now = zoneAt(-sub.position.y);
      if (now !== zone && state === "diving") {
        zone = now;
        if (!titled) hud.zone(ZONES[zone].name);
      }
    }

    const powered = dive.power > 0 && state !== "lost";
    sub.update(dt, controls, chase.yaw, chase.pitch, powered && !(launched > 0.8));
    if (launched > 0 && !sub.frozen) sub.position.y -= dt * 1.1;
    sub.arm.update(dt);
    dive.update(dt, state === "diving");

    const portrait = window.innerHeight > window.innerWidth;
    ending.update(dt);
    chase.update(dt, sub.position, sub.velocity, portrait);
    const eye = chase.camera.position;
    const lantern = wrecks.power * Math.max(0, 1 - Vector3.Distance(eye, stationMark) / 110);
    water.update(dt, eye, lantern * 0.9);
    const s = sub.position;
    water.shadow[0] = s.x;
    water.shadow[1] = s.y;
    water.shadow[2] = s.z;
    water.shadow[3] = 0.62 * Math.max(0, 1 - -s.y / 70);

    glows.begin();
    wrecks.update(water.time, glows);
    cargo.update(dt, water.time, eye, glows);
    world.fauna.update(dt, sub.position, glows);
    world.leviathan.update(dt, sub.position, water.ping[3] > 0, glows);
    const aim = chase.camera.getDirection(Vector3.Forward());
    sub.lamps.update(dt, sub.forward(), aim, powered && water.depth > 9, save.stat("lights"), glows);
    glows.end();
    world.effects.update(dt, sub, powered);
    world.flora.update(eye);
    world.backdrop.update();
    const right = chase.camera.getDirection(Vector3.Right());
    const up = chase.camera.getDirection(Vector3.Up());
    for (const shader of [world.backdrop.snowShader, glows.shader]) {
      shader.setVector3("u_right", right);
      shader.setVector3("u_up", up);
    }
    const { spot } = sub.lamps;
    world.backdrop.lamp(spot.position, spot.direction, Math.min(1, spot.intensity / 8));

    if (playing) {
      hud.update(gauge());
      hud.markers.update(scene, markers(), sub.position);
    }
    sound.update(dt, {
      depth: water.depth, thrust: sub.frozen ? 0 : sub.thrust, speed: sub.velocity.length(), servo: sub.arm.phase === "reach" || sub.arm.phase === "back",
      pressure: -sub.position.y / dive.limit, low: dive.power < 0.12 || -sub.position.y > dive.limit, quiet: !playing, music: state === "ending" ? 0.3 : 1, powered,
    });

    metric("state", state);
    metric("depth", Math.round(-sub.position.y * 10) / 10);
    metric("power", Math.round(dive.power * 1000) / 1000);
    metric("hull", Math.round(dive.hull * 1000) / 1000);
    metric("credits", save.data.credits);
    metric("hold", dive.hold.length);
    metric("pages", save.data.pages.length);
    metric("dives", save.data.dives);
    metric("finished", save.data.finished);
  };

  if (import.meta.env.DEV) Object.assign(window, { __game: { world, dive, save, chase, controls, sub, state: () => state, wrecksData: WRECKS, collar } });
  return { update };
}
