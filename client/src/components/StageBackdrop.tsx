import { useEffect, useRef } from 'react';

/**
 * Low-res WebGL nebula behind the opening stage: swirling fbm noise, god-rays
 * that spin up with `intensity`, ordered-dither color quantization for a
 * retro look, and an optional glitch mode for misprints. Rendered at 1/4
 * resolution and upscaled with pixelated sampling.
 */

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 r;
uniform float t;
uniform float k;
uniform float g;
uniform vec3 c1;
uniform vec3 c2;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * r) / r.y;
  float d = length(uv);
  float ang = atan(uv.y, uv.x);
  float swirl = fbm(vec2(ang * 1.6 + t * 0.04, d * 3.2 - t * (0.15 + k * 1.4)));
  float rays = pow(abs(sin(ang * 7.0 + t * (0.25 + k * 2.5))), 14.0) * k * (1.0 - smoothstep(0.1, 1.2, d));
  float glow = (1.0 - smoothstep(0.0, 0.85, d)) * (0.18 + k * 0.85);
  vec3 col = mix(c1, c2, swirl) * (0.22 + swirl * 0.55) + glow * c2 * 0.55 + rays * mix(c2, vec3(1.0), 0.4) * 0.6;
  if (g > 0.0) {
    float band = step(0.9, h(vec2(floor(gl_FragCoord.y / 3.0), floor(t * 14.0))));
    col = mix(col, vec3(1.0, 0.15, 0.2) * (0.5 + h(vec2(t, gl_FragCoord.y))), band * g);
    col.r += g * 0.15 * step(0.5, h(vec2(floor(t * 20.0))));
  }
  // 2x2 ordered (Bayer) dither + 6-level quantize: a clean retro gradient instead of noise
  vec2 cell = mod(floor(gl_FragCoord.xy), 2.0);
  float bayer = (cell.x * 2.0 + cell.y * 3.0 - (cell.x * cell.y) * 4.0) / 4.0;
  col *= 0.82;
  col = floor(col * 6.0 + bayer) / 6.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0) * (1.0 - smoothstep(0.15, 1.5, d)), 1.0);
}`;

export interface StageTone {
  intensity: number;
  c1: [number, number, number];
  c2: [number, number, number];
  glitch: number;
}

export const TONES: Record<string, Omit<StageTone, 'intensity'>> = {
  calm: { c1: [0.08, 0.05, 0.2], c2: [1.0, 0.31, 0.55], glitch: 0 },
  shiny: { c1: [0.1, 0.1, 0.25], c2: [0.85, 0.9, 1.0], glitch: 0 },
  holo: { c1: [0.03, 0.12, 0.25], c2: [0.37, 0.95, 1.0], glitch: 0 },
  parallax: { c1: [0.1, 0.05, 0.3], c2: [0.63, 0.52, 1.0], glitch: 0 },
  pop3d: { c1: [0.2, 0.1, 0.02], c2: [1.0, 0.82, 0.25], glitch: 0 },
  living: { c1: [0.2, 0.05, 0.25], c2: [1.0, 0.42, 0.84], glitch: 0 },
  misprint: { c1: [0.15, 0.0, 0.02], c2: [1.0, 0.16, 0.16], glitch: 1 },
};

export function StageBackdrop({ tone }: { tone: StageTone }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toneRef = useRef(tone);
  toneRef.current = tone;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) {
      canvas.classList.add('is-fallback');
      return;
    }
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.classList.add('is-fallback');
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = {
      r: gl.getUniformLocation(prog, 'r'),
      t: gl.getUniformLocation(prog, 't'),
      k: gl.getUniformLocation(prog, 'k'),
      g: gl.getUniformLocation(prog, 'g'),
      c1: gl.getUniformLocation(prog, 'c1'),
      c2: gl.getUniformLocation(prog, 'c2'),
    };

    const resize = () => {
      canvas.width = Math.ceil(window.innerWidth / 4);
      canvas.height = Math.ceil(window.innerHeight / 4);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    // Eased uniforms so tier changes blend instead of snapping.
    const cur = { k: 0, g: 0, c1: [...toneRef.current.c1], c2: [...toneRef.current.c2] };
    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const tgt = toneRef.current;
      cur.k += (tgt.intensity - cur.k) * 0.06;
      cur.g += (tgt.glitch - cur.g) * 0.2;
      for (let i = 0; i < 3; i++) {
        cur.c1[i] += (tgt.c1[i] - cur.c1[i]) * 0.05;
        cur.c2[i] += (tgt.c2[i] - cur.c2[i]) * 0.05;
      }
      gl.uniform2f(u.r, canvas.width, canvas.height);
      gl.uniform1f(u.t, (now - start) / 1000);
      gl.uniform1f(u.k, cur.k);
      gl.uniform1f(u.g, cur.g);
      gl.uniform3f(u.c1, cur.c1[0], cur.c1[1], cur.c1[2]);
      gl.uniform3f(u.c2, cur.c2[0], cur.c2[1], cur.c2[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      // No loseContext(): StrictMode remounts reuse this same canvas context.
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, []);

  return <canvas ref={canvasRef} className="stage-backdrop px" aria-hidden />;
}
