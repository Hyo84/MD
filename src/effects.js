// 간단한 캔버스 파티클 / 플로팅 텍스트 이펙트

export class Effects {
  constructor() {
    this.particles = [];
    this.texts = [];
    this.flashLines = []; // 아서 검기 등 라인 플래시
  }

  burst(x, y, color, count = 14, speed = 3.5, size = 3) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.5 + Math.random() * 0.35,
        maxLife: 0.85,
        color,
        size: size * (0.6 + Math.random() * 0.8),
      });
    }
  }

  hitFlash(x, y, color = '#fff') {
    this.burst(x, y, color, 5, 2.2, 2);
  }

  floatText(x, y, text, color = '#fff', size = 16, life = 1.0) {
    this.texts.push({ x, y, text, color, size, life, maxLife: life });
  }

  lineFlash(y, color = '#9be7ff') {
    this.flashLines.push({ y, life: 0.35, maxLife: 0.35, color });
  }

  update(dt) {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    for (const t of this.texts) {
      t.y -= 28 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter(t => t.life > 0);

    for (const l of this.flashLines) l.life -= dt;
    this.flashLines = this.flashLines.filter(l => l.life > 0);
  }

  draw(ctx, canvasW) {
    for (const l of this.flashLines) {
      const a = Math.max(0, l.life / l.maxLife);
      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = l.color;
      ctx.lineWidth = 6 + 18 * a;
      ctx.shadowColor = l.color;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.moveTo(0, l.y);
      ctx.lineTo(canvasW, l.y);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const t of this.texts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
      ctx.fillStyle = t.color;
      ctx.font = `bold ${t.size}px 'Malgun Gothic', sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }
}
