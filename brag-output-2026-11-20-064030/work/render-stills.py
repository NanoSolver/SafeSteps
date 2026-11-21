from pathlib import Path
import re
import subprocess

work = Path(__file__).parent
film = work / "film"
scenes = work / "stills"
scenes.mkdir(exist_ok=True)
edge = Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")

for shot in ("hook", "routes", "hazards", "checkin_progress", "checkin_arrived", "outro"):
    name = shot.split("_", 1)[0]
    source = (film / "compositions" / f"{name}.html").read_text(encoding="utf-8")
    content = re.sub(r"^<template>|</template>$", "", source.strip(), flags=re.S)
    content = re.sub(r"<script>.*?</script>", "", content, flags=re.S)
    if name == "hazards":
        content = content.replace(".hazards-view .maplabel{display:none}", ".maplabel{display:none}")
    if name == "checkin":
        visibility = (
            "#walking-state{opacity:1!important}#arrived-state{opacity:0!important}"
            if shot.endswith("progress") else
            "#walking-state{opacity:0!important}#arrived-state{opacity:1!important}"
        )
        content = content.replace("#arrived-state{opacity:0}", f"#arrived-state{{opacity:0}}{visibility}")
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
html,body{{margin:0;width:1920px;height:1080px;overflow:hidden;background:#e3f1e9}}
</style></head><body>{content}</body></html>"""
    html_path = scenes / f"{shot}.html"
    png_path = scenes / f"{shot}.png"
    html_path.write_text(page, encoding="utf-8")
    profile = work / f"edge-profile-{name}"
    subprocess.run([
        str(edge), "--headless=new", "--disable-gpu", "--no-sandbox",
        "--hide-scrollbars", "--force-device-scale-factor=1",
        "--window-size=1920,1080", f"--user-data-dir={profile}",
        f"--screenshot={png_path}", html_path.resolve().as_uri(),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30)
    print(f"Captured {shot}: {png_path.stat().st_size} bytes")
