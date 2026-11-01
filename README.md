<h1 align="center">FLYANS</h1>
<p align="center"><img src="assets/icon.png" width="120" alt="FLYANS"></p>
<p align="center"><i>A living fly-colony observatory for Windows.</i></p>

---

## The story

In the beginning there was a valley, and the valley was empty.

Then came the flies — not scripted sprites, but creatures each carrying a real
*Drosophila* connectome inside it, the **MaleCNS v1.0** wiring of an actual
insect brain. Light strikes an eye; the signal runs the true circuit; the fly
turns. Every one of them thinks with the same machinery nature built.

And they do not merely wander. They raise a city.

Stone by resin stone the colony builds — homes first, then workshops and
gardens, then stages for music and temples for the rites. Families fill the
houses; the unhoused are taken in before new walls go up. Flies learn trades
and teach them onward, each passing its craft to the next, until a whole city
knows every job. They keep their own hours: market by day, music at dusk, the
roofs going dark as they roost. Rain drives them indoors; clear skies call them
back out.

As the colony grows it passes through **eras** — Founding, Flourishing, a
Golden Age, and on toward a shimmering Crystal Age — and the city glows a little
richer at each threshold, a quiet civilisation advancing before your eyes. At
its heart one fly is crowned **God · Ruler · King**, haloed and larger than the
rest, and the colony gathers to hail it.

You can simply watch it live. Or you can speak to it.

---

## What you do here

- **Watch** — orbit the valley, ride a fly, take the grand camera tour, drop
  into Photo or Cinema mode for a clean frame.
- **Command** — a local command box and a wall of quick buttons steer the
  colony in plain words: `build 5 homes`, `build a garden`, `build 3 temples`,
  `everyone worship`, `festival`, `pace 15`, `auto on`, `pause`, `save`. Type
  `help` for the full tongue.
- **Let it run** — the colony plans its own work — housing, gardens, workshops,
  music, learning — while the day turns; your commands only redirect it.
- **Keep it** — worlds save locally, and export or import as a single JSON.

Everything runs on your own machine. The command box uses local rules only.

---

## Requirements

- Windows x64
- **Python 3** on your `PATH` (the colony server is a small local Python process)
- A GPU with hardware acceleration enabled

Worlds, logs and recordings are written to your per-user app-data folder
(`%LOCALAPPDATA%\FLYANS\colony`); the install tree is never touched.

## Run from source

```powershell
npm install
npm start
```

Electron launches, the colony server comes up on `http://127.0.0.1:8776/`, and
the valley opens once the world is ready.

## Build the installer

```powershell
npm install
npm run dist
```

Output: `dist/FLYANS-Setup-<version>.exe` — a per-machine installer with Start
Menu and desktop shortcuts. Updates arrive through GitHub Releases via
`electron-updater`.

## Credits

- 3D rendering — [three.js](https://threejs.org/) (MIT)
- Furniture meshes — [Kenney Furniture Kit](https://kenney.nl/) (CC0)
- Connectome data — the **MaleCNS v1.0** *Drosophila* dataset

## License

[MIT](LICENSE) © briksquared
