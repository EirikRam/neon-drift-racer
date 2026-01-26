const DEFAULT_PARALLAX = 0.2;

export function drawSkyline(ctx, cameraPos, img, options = {}) {
  if (!img) {
    return false;
  }

  const parallax = options.parallax ?? DEFAULT_PARALLAX;
  const alpha = options.alpha ?? 1;
  const pixelScale = options.pixelScale ?? 1;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const offsetX = -cameraPos.x * parallax * pixelScale;
  const drawY = height * 0.2;
  const tileWidth = img.width || 1;
  const startX = ((offsetX % tileWidth) + tileWidth) % tileWidth - tileWidth;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;

  for (let x = startX; x < width + tileWidth; x += tileWidth) {
    ctx.drawImage(img, x, drawY);
  }
  ctx.restore();
  return true;
}

export function drawSkylineFallback(ctx) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const gradient = ctx.createLinearGradient(0, 0, 0, height * 0.6);
  gradient.addColorStop(0, "#0b0a2a");
  gradient.addColorStop(1, "#2a0c3a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
