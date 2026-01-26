export class ParticlePool {
  constructor(maxParticles) {
    this.maxParticles = maxParticles;
    this.particles = new Array(maxParticles);
    this.cursor = 0;
    this.activeCount = 0;

    for (let i = 0; i < maxParticles; i += 1) {
      this.particles[i] = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        size: 0,
        color: "#ffffff",
        alpha: 1,
      };
    }
  }

  spawn({ x, y, vx, vy, life, size, color, alpha }) {
    let picked = null;

    for (let i = 0; i < this.maxParticles; i += 1) {
      const index = (this.cursor + i) % this.maxParticles;
      const particle = this.particles[index];
      if (particle.life <= 0) {
        picked = particle;
        this.cursor = (index + 1) % this.maxParticles;
        break;
      }
    }

    if (!picked) {
      picked = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % this.maxParticles;
    }

    picked.x = x;
    picked.y = y;
    picked.vx = vx;
    picked.vy = vy;
    picked.life = life;
    picked.maxLife = life;
    picked.size = size;
    picked.color = color;
    picked.alpha = alpha;
  }

  update(dt) {
    let count = 0;

    for (let i = 0; i < this.maxParticles; i += 1) {
      const particle = this.particles[i];
      if (particle.life <= 0) {
        continue;
      }

      particle.life -= dt;
      if (particle.life <= 0) {
        particle.life = 0;
        continue;
      }

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      count += 1;
    }

    this.activeCount = count;
  }

  render(ctx) {
    ctx.save();

    for (let i = 0; i < this.maxParticles; i += 1) {
      const particle = this.particles[i];
      if (particle.life <= 0) {
        continue;
      }

      const t = particle.life / particle.maxLife;
      const size = particle.size * t;

      ctx.globalAlpha = particle.alpha * t;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}
