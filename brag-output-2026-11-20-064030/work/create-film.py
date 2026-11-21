from pathlib import Path

base = Path(__file__).parent / "film"
style = """
*{box-sizing:border-box}body{margin:0}#root{position:absolute;inset:0;font-family:Inter,sans-serif;color:#1b2a23}
.ground{position:absolute;inset:0;background:#e3f1e9}.paper{background:#f6f8f7}
.brand{font:700 40px 'Playfair Display',serif;display:flex;align-items:center;gap:16px}
.mark{width:58px;height:58px;background:#2c624b;color:#fff;border-radius:15px;display:grid;place-items:center;font:700 34px Inter}
.eyebrow{font:700 29px Inter;color:#2c624b;letter-spacing:2px}
h1,h2,p{margin:0}h1{font:700 103px/1.13 'Playfair Display',serif;letter-spacing:-3px}h2{font:700 43px/1.2 Inter}
.muted{color:#53625b}.small{font:400 30px/1.5 Inter}.bold{font-weight:700}
.green{color:#2c624b}.button{border:0;border-radius:12px;background:#2c624b;color:white;padding:23px 33px;font:700 30px Inter;display:inline-block}
.card{background:#fff;border:2px solid #d8e0db;border-radius:22px;padding:34px}
.head{position:absolute;left:120px;top:85px}.sub{font:400 33px/1.5 Inter;color:#53625b;margin-top:21px}
.window{position:absolute;left:120px;top:260px;width:1680px;height:700px;border:2px solid #c8d6ce;border-radius:22px;background:white;overflow:hidden}
.bar{height:74px;border-bottom:2px solid #d8e0db;padding:13px 27px;display:flex;justify-content:space-between;align-items:center;background:#fff}
.bar .brand{font-size:31px}.bar .mark{width:43px;height:43px;font-size:25px;border-radius:10px}
.bar-label{font:400 27px Inter;color:#53625b}.sidebar{position:absolute;left:0;top:74px;bottom:0;width:430px;border-right:2px solid #d8e0db;padding:28px;background:#fff;z-index:3}
.sidebar h2{font-size:35px;margin-bottom:24px}.field{border:2px solid #d8e0db;border-radius:12px;padding:17px 12px;font:400 28px Inter;margin:12px 0;white-space:nowrap}
.dot{display:inline-grid;place-items:center;width:33px;height:33px;border-radius:50%;font-size:23px;color:#fff;background:#2964df;margin-right:9px}.dot.red{background:#b73f45}
.routecards{display:flex;gap:10px;margin-top:25px}.routecard{border:2px solid #b1c7f8;border-radius:12px;background:#edf3ff;padding:15px 12px;width:50%;font:400 27px Inter}.routecard strong{font-size:35px;display:block;margin:8px 0}
.routecard.alt{background:#fff;border-color:#d8e0db}.blue-button{margin-top:20px;background:#2964df;width:100%;text-align:center;font-size:27px;padding:19px 10px}
.map{position:absolute;left:430px;top:74px;width:1250px;height:626px;background:#e9ede6;overflow:hidden}
.map svg{position:absolute;inset:0;width:100%;height:100%}.maplabel{position:absolute;font:400 26px Inter;color:#53625b;background:#e9ede6e8;padding:3px 7px;border-radius:5px}
.maptag{position:absolute;right:22px;bottom:18px;font:400 24px Inter;background:white;padding:7px 10px;border-radius:8px;color:#53625b}
.pin{position:absolute;display:grid;place-items:center;width:54px;height:54px;border:4px solid white;border-radius:50%;background:#2964df;color:#fff;font:700 30px Inter;box-shadow:0 3px 8px #0003}
.pin.destination{background:#b73f45}.pin.hazard{background:#a04d15}
#root *{font-family:Arial,sans-serif}#root h1,#root .brand{font-family:Georgia,serif}#root .sidebar h2{font-family:Arial,sans-serif}
"""

def scene(name, markup, animation, extra=""):
    html = f"""<template><style>{style}{extra}</style>
<div id="root" data-composition-id="{name}" data-width="1920" data-height="1080">{markup}</div>
<script>const tl=gsap.timeline({{paused:true}});
{animation}
window.__timelines["{name}"]=tl;</script></template>"""
    (base / "compositions" / (name + ".html")).write_text(html, encoding="utf-8")

brand = '<div class="brand"><span class="mark">♧</span>SafeStride</div>'
roads = []
for x in range(70, 1250, 180):
    roads.append(f'<path d="M{x} 0 L{x-42} 626" stroke="#d1d8cf" stroke-width="33"/>')
    roads.append(f'<path d="M{x} 0 L{x-42} 626" stroke="#fff" stroke-width="24"/>')
for y in range(70, 626, 105):
    roads.append(f'<path d="M0 {y} L1250 {y-45}" stroke="#d1d8cf" stroke-width="30"/>')
    roads.append(f'<path d="M0 {y} L1250 {y-45}" stroke="#fff" stroke-width="22"/>')
shape = "M220 430 L325 382 L455 295 L620 285 L760 246 L890 268 L1050 197"
mapart = f"""<div class="map">
<svg viewBox="0 0 1250 626" aria-hidden="true">
{''.join(roads)}
<path d="M70 45L360 25L450 250L190 325L60 190Z" fill="#c5dcc4"/>
<path d="M1080 10C1170 40 1220 110 1165 195C1090 223 1038 149 1080 10Z" fill="#b9d6de"/>
<path d="M220 430L415 450L560 410L800 390L920 280L1050 197" fill="none" stroke="#839ab8" stroke-width="11" stroke-linejoin="round"/>
<path d="{shape}" fill="none" stroke="#fff" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>
<path class="route-line" d="{shape}" fill="none" stroke="#2964df" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
<span class="maplabel" style="left:135px;top:135px">Cubbon Park</span>
<span class="maplabel" style="left:605px;top:326px">Church Street</span>
<span class="maplabel" style="left:905px;top:140px">MG Road</span>
<span class="pin origin" style="left:193px;top:404px">A</span>
<span class="pin destination" style="left:1024px;top:170px">B</span>
<span class="maptag">Illustrative demo route</span></div>"""

def app_window(sidebar, overlay=""):
    return f"""<div class="window" id="app-window"><div class="bar">{brand}<span class="bar-label">Plan a walk &nbsp;&nbsp; Safe Havens &nbsp;&nbsp; Check-in</span></div>
<div class="sidebar">{sidebar}</div>{mapart}{overlay}</div>"""

scene("hook",
"""<div class="ground"></div><div class="hook-copy"><p class="eyebrow">FOR THE WALK HOME</p>
<h1 id="hook-title">Going home?</h1><p class="sub" id="hook-sub">The way there can feel better.</p></div>
<div class="hook-art" aria-hidden="true"><svg viewBox="0 0 650 600">
<path id="hook-route" d="M30 490L170 400L170 275L340 200L490 110" fill="none" stroke="#2c624b" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="30" cy="490" r="21" fill="#2964df" stroke="white" stroke-width="8"/>
</svg><div id="home-marker">⌂</div></div>""",
"""tl.fromTo("#hook-title",{opacity:0,filter:"blur(8px)"},{opacity:1,filter:"blur(0px)",duration:.3},.05);
tl.fromTo("#hook-sub",{opacity:0},{opacity:1,duration:.4},.65);
tl.fromTo("#hook-route",{strokeDasharray:1000,strokeDashoffset:1000},{strokeDashoffset:0,duration:1.3,ease:"power2.out"},.2);
tl.fromTo("#home-marker",{scale:.5,opacity:0},{scale:1,opacity:1,duration:.25,ease:"power3.out"},1.45);""",
""".hook-copy{position:absolute;left:140px;top:330px}.hook-copy h1{font-size:140px;margin-top:22px}
.hook-art{position:absolute;width:650px;height:600px;left:1110px;top:245px}.hook-art svg{width:650px;height:600px}
#home-marker{position:absolute;left:440px;top:46px;width:100px;height:100px;border-radius:27px;background:#2c624b;color:white;font:700 75px Inter;display:grid;place-items:center}""")

side = """<h2>Plan a walk</h2><div class="field"><span class="dot">A</span>Cubbon Park</div>
<div class="field"><span class="dot red">B</span>MG Road Metro</div><div class="button blue-button">Find walking routes</div>
<div class="routecards"><div class="routecard" id="fastest"><span>Fastest</span><strong>Route A</strong><span>Walking route</span></div>
<div class="routecard alt" id="alternate"><span>Alternate</span><strong>Route B</strong><span>Walking route</span></div></div>
<p class="small muted" style="font-size:27px;margin-top:20px">Choose your route.</p>"""
scene("routes",
    '<div class="ground paper"></div><div class="head"><h1>Pick your way home.</h1></div>' + app_window(side),
    """tl.fromTo("#app-window",{y:60,opacity:0},{y:0,opacity:1,duration:.45,ease:"power3.out"},0);
tl.fromTo(".route-line",{strokeDasharray:1200,strokeDashoffset:1200},{strokeDashoffset:0,duration:1.5,ease:"power2.inOut"},.6);
// beat-grid: route cards settle at 6.56s and 7.64s globally.
tl.fromTo("#fastest",{opacity:0,y:20},{opacity:1,y:0,duration:.25},3.26);
tl.fromTo("#alternate",{opacity:0,y:20},{opacity:1,y:0,duration:.25},4.34);""")

report = """<h2>Along the way</h2><p class="small muted">Community reports on your map.</p>
<div class="field" style="margin-top:28px">Hazards &nbsp; ✓</div>
<div class="field">Community havens &nbsp; ✓</div>
<p class="small" style="margin-top:28px">Report a hazard</p>
<div class="button blue-button">Pin a location</div>"""
overlay = """<div class="pin hazard" id="hazard-pin" style="left:1160px;top:340px">!</div>
<div class="hazard-popup card" id="hazard-popup"><span class="demo-label">DEMO REPORT</span><h2>Broken streetlight</h2>
<p class="small muted">Community report</p><div class="confirm-label">Confirm report</div></div>"""
scene("hazards",
    '<div class="ground paper hazards-view"></div><div class="head"><h1>See what’s been reported.</h1></div>' + app_window(report,overlay),
    """tl.fromTo("#hazard-pin",{y:-45,opacity:0},{y:0,opacity:1,duration:.35,ease:"power3.out"},.2);
tl.fromTo("#hazard-popup",{scale:.9,opacity:0},{scale:1,opacity:1,duration:.3,ease:"power3.out"},.8);""",
    """.hazard-popup{position:absolute;left:620px;top:100px;width:560px;z-index:4;padding:27px}.hazard-popup h2{font-size:37px;margin:12px 0}
.maplabel{display:none}
.demo-label{font:700 25px Inter;color:#86420f;letter-spacing:1px}.confirm-label{color:#2c624b;font:700 29px Inter;margin-top:17px}""")

scene("checkin",
"""<div class="ground"></div><div class="head"><h1>Let someone know<br>you’re home.</h1></div>
<div class="check-panels"><div class="card owner"><span class="eyebrow">YOUR WALK</span><h2>Trusted-contact<br>check-in</h2><p class="small muted">Expected check-in by 8:30 pm</p>
<div class="link-box">Private contact link</div><div class="button" id="home-button">I’m home</div></div>
<div class="connector" aria-hidden="true">→</div>
<div class="card contact"><span class="eyebrow">YOUR CONTACT’S VIEW</span><h2>Demo Walker</h2>
<div id="walking-state"><div class="state walking">Walk in progress</div><p class="small muted">ETA 8:30 pm · demo data</p></div>
<div id="arrived-state"><div class="state arrived">✓ &nbsp; Arrived</div><p class="small muted">8:26 pm · demo data</p></div></div></div>
<p class="demo-caption">Illustrative check-in</p>""",
"""tl.fromTo(".owner",{x:-50,opacity:0},{x:0,opacity:1,duration:.4,ease:"power3.out"},.1);
tl.fromTo(".contact",{x:50,opacity:0},{x:0,opacity:1,duration:.4,ease:"power3.out"},.35);
tl.fromTo("#home-button",{backgroundColor:"#2c624b"},{backgroundColor:"#1b4533",duration:.15},3.45);
// beat-locked: arrival lands at global 17.47s.
tl.fromTo("#walking-state",{opacity:1},{opacity:0,duration:.13},3.56);
tl.fromTo("#arrived-state",{opacity:0,y:10},{opacity:1,y:0,duration:.22,ease:"power3.out"},3.77);""",
""".check-panels{position:absolute;left:190px;top:410px;display:flex;align-items:center;gap:65px}.owner{width:655px;height:500px}.contact{position:relative;width:655px;height:420px}
.check-panels h2{margin:22px 0}.check-panels .eyebrow{font-size:25px}.link-box{border:2px solid #d8e0db;border-radius:10px;padding:16px;font-size:28px;color:#53625b;margin:22px 0}.connector{font:400 65px Inter;color:#2c624b}
.state{font:700 35px Inter;border-radius:12px;padding:18px 22px;display:inline-block;margin:15px 0 20px}.walking{background:#edf3ff;color:#2256a9}.arrived{background:#e3f1e9;color:#2c624b}
#walking-state,#arrived-state{position:absolute;left:34px;top:160px}#arrived-state{opacity:0}.demo-caption{position:absolute;left:190px;top:957px;color:#53625b;font:400 28px Inter}""")

scene("outro",
"""<div class="ground"></div><div class="outro-content" data-hold>
<span class="outro-mark">♧</span><h1 id="outro-title" data-var-text="product">SafeStride</h1>
<p class="outro-tagline">The way there can feel better.</p>
<p class="outro-url">safesteps-smoky.vercel.app</p><p class="outro-note">Bengaluru college project · Area survey planned</p></div>""",
"""// beat-locked: outro begins at global 18.6s, near 18.56s cue.
tl.fromTo(".outro-content",{opacity:0,filter:"blur(8px)"},{opacity:1,filter:"blur(0px)",duration:.3},0);""",
""".outro-content{position:absolute;inset:100px;display:flex;align-items:center;justify-content:center;flex-direction:column}.outro-mark{display:grid;place-items:center;width:110px;height:110px;border-radius:28px;background:#2c624b;color:white;font:700 65px Inter;margin-bottom:22px}.outro-content h1{font-size:125px}
.outro-tagline{font:400 39px Inter;margin-top:20px}.outro-url{font:700 31px Inter;color:#2c624b;margin-top:48px}.outro-note{font:400 28px Inter;color:#53625b;margin-top:15px}""")

scenes = [("hook",0,3.3),("routes",3.3,6),("hazards",9.3,4.4),("checkin",13.7,4.9),("outro",18.6,3.4)]
hosts = "\n".join(f'<div id="{name}" class="clip" data-composition-id="{name}" data-composition-src="compositions/{name}.html" data-start="{start}" data-duration="{duration}" data-width="1920" data-height="1080" data-track-index="1" data-track-kind="graphics"></div>' for name,start,duration in scenes)
html = f"""<!doctype html><html data-composition-variables='[{{"id":"product","type":"string","label":"Product name","default":"SafeStride"}},{{"id":"color-ground","type":"color","label":"Mint","default":"#e3f1e9"}},{{"id":"color-accent","type":"color","label":"Forest","default":"#2c624b"}}]'>
<head><meta charset="utf-8"><title>SafeSteps — the walk home</title><script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<style>*{{box-sizing:border-box}}html,body{{margin:0;width:1920px;height:1080px;overflow:hidden}}#root{{position:absolute;inset:0}}.clip[data-composition-src]{{position:absolute;inset:0}}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="22" data-width="1920" data-height="1080" data-fps="30">
{hosts}
<audio id="music" class="clip" data-start="0" data-duration="22" data-track-index="10" data-volume="0.30" data-fade-in="0.4" data-fade-out="1.8" src="assets/music.mp3"></audio>
<audio id="reveal" class="clip" data-start="3.3" data-duration="0.3" data-track-index="11" data-volume="0.55" src="assets/reveal.ogg"></audio>
<audio id="route-click" class="clip" data-start="6.56" data-duration="0.15" data-track-index="11" data-volume="0.55" src="assets/click.ogg"></audio>
<audio id="pin-drop" class="clip" data-start="9.5" data-duration="0.4" data-track-index="11" data-volume="0.45" src="assets/drop.ogg"></audio>
<audio id="home-click" class="clip" data-start="17.15" data-duration="0.15" data-track-index="11" data-volume="0.6" src="assets/click.ogg"></audio>
</div><script>window.__timelines=window.__timelines||{{}};window.__timelines.main=gsap.timeline({{paused:true}});</script></body></html>"""
(base / "index.html").write_text(html, encoding="utf-8")
print("Created five scenes and a 22-second master composition.")
