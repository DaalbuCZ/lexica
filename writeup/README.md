# Lexica layout writeup

This is a separate React/Vite site containing the interactive layout explanation and implementation guide.

From the repository root, run `pnpm dev:writeup` and open [the writeup](http://127.0.0.1:5174/).

Run `pnpm build:writeup` to generate both pages in `writeup/build/`. The default Lexica build uses its own entry point.

The examples import Lexica’s algorithms from `src/core/`. The finale runs the solver in a worker and captures intermediate drawings through its optional observation callback.
