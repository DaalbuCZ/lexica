# Working on Lexica

- Keep this as the existing local web app. Do not publish it to Sites or reintroduce the Flutter rewrite; the user deploys it themselves.
- Use Vite with pnpm (`pnpm dev`, `pnpm build`, `pnpm test`). The Vite app source is in `dist/`; tests are in `tests.mjs`.
- Make focused changes that fit the current app and preserve existing FSM files and local data. Keep lexer input and preferences compatible with FSM save/import/export.
- When the user asks for UI changes, check the running local app when practical and keep the dev server on Vite.
- After completing a requested change, commit it and push to the existing GitHub repository (`origin`, `main`), unless the user asks otherwise. Report the commit and any checks performed. Never deploy or publish the app as part of this workflow.
