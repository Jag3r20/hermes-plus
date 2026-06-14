// Animovane pozadi - flow field z plynoucich modrych vlaken (JARVIS vibe).
(function () {
  const canvas = document.getElementById("bg-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let W, H, particles = [], t = 0;
  const COUNT = 240;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    ctx.fillStyle = "#05070f";
    ctx.fillRect(0, 0, W, H);
  }
  window.addEventListener("resize", resize);

  function spawn() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      life: 0,
      max: 140 + Math.random() * 220,
      speed: 0.8 + Math.random() * 1.0,
    };
  }

  // Plynule "vlnove pole" - smer pohybu castice podle pozice a casu.
  function field(x, y) {
    return (
      Math.sin(x * 0.0016 + t * 0.0007) * 2.0 +
      Math.cos(y * 0.0019 - t * 0.0005) * 2.0 +
      Math.sin((x + y) * 0.0011 + t * 0.0003) * 1.4
    );
  }

  function frame() {
    t++;
    // jemne zeslabeni = dlouhe svetelne stopy
    ctx.fillStyle = "rgba(5, 7, 15, 0.085)";
    ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1.1;

    for (const p of particles) {
      const a = field(p.x, p.y);
      const nx = p.x + Math.cos(a) * p.speed * 1.5;
      const ny = p.y + Math.sin(a) * p.speed * 1.5;
      const fade = Math.min(p.life / 30, (p.max - p.life) / 30, 1);
      const alpha = Math.max(0, fade) * 0.42;
      // mix modra -> azurova podle pozice
      const hue = 212 + Math.sin(p.x * 0.002 + p.y * 0.002) * 22;
      ctx.strokeStyle = `hsla(${hue}, 100%, 68%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      p.x = nx; p.y = ny; p.life++;
      if (p.life > p.max || p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10) {
        Object.assign(p, spawn());
      }
    }
    requestAnimationFrame(frame);
  }

  resize();
  for (let i = 0; i < COUNT; i++) particles.push(spawn());
  frame();
})();
