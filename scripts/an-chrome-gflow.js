// an-chrome-gflow.js — keeps gflow's Chrome hidden while a run is going (JXA, macOS).
//   osascript -l JavaScript an-chrome-gflow.js <parent-pid>
// gflow must drive a real headed Chrome (reCAPTCHA rejects headless), so every run pops a Chrome
// app that grabs focus. This loop hides each Chrome launched on a gflow-cli profile and hands focus
// back to the app that had it. It never touches the user's own Chrome (different --user-data-dir)
// and exits as soon as <parent-pid> is gone, so it cannot outlive the gflow.mjs run that started it.
// Needs Accessibility permission for the terminal running it; without it, it exits quietly.
function run(argv) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  const se = Application("System Events");
  const parent = argv[0];
  const sh = (cmd) => { try { return app.doShellScript(cmd); } catch (e) { return ""; } };
  const alive = (pid) => sh(`kill -0 ${pid} && echo y`) === "y";
  let last = null;
  try { se.processes.whose({ frontmost: true })[0].unixId(); } catch (e) { return; }
  while (!parent || alive(parent)) {
    const pids = sh("pgrep -f 'MacOS/Google Chrome --.*gflow-cli/profile_' || true").split(/\s+/).filter(Boolean).map(Number);
    try {
      const front = se.processes.whose({ frontmost: true })[0].unixId();
      if (!pids.includes(front)) last = front;
      for (const pid of pids) {
        const p = se.processes.whose({ unixId: pid });
        if (p.length && p[0].visible()) {
          p[0].visible = false;
          if (last) { const q = se.processes.whose({ unixId: last }); if (q.length) q[0].frontmost = true; }
        }
      }
    } catch (e) {}
    delay(0.25);
  }
}
