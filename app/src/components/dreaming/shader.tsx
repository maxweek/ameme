import { useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react';

// ── Config ──────────────────────────────────────────

export interface DreamingShaderConfig {
  // Colors (hex)
  colors?: string[];
  colorSpeed?: number;

  colorsActive?: string[];     // цвета во время активного dreaming
  colorSpeedActive?: number;

  // Intensity
  idleIntensity?: number;
  baseIntensity?: number;
  maxIntensity?: number;

  // Speed
  idleSpeed?: number;
  activeSpeed?: number;
  animationSpeed?: number;

  // Mouse
  mouseInfluence?: number;       // 0 = нет реакции, 1 = полная
  mouseRadius?: number;          // радиус влияния

  // Explosion
  explosionAttack?: number;
  explosionDecay?: number;
  explosionDuration?: number;    // ms

  // Pulse
  pulseAttack?: number;
  pulseDecay?: number;
  pulseDuration?: number;        // ms
  pulseRingWidth?: number;
  pulseRingSpeed?: number;

  // Fade
  fadeSpeed?: number;

  // Shape
  iterations?: number;           // complexity (1-20)
  vignetteStrength?: number;     // 0 = нет, 1 = полная
  noiseExponent?: number;
  noiseThreshold?: number;
  layerScaleMultiplier?: number;

  density?: number
  densityActive?: number
}

const DEFAULTS: Required<DreamingShaderConfig> = {
  colors: ['#180013', '#000e1b'],
  colorSpeed: 0.3,

  colorsActive: ['#ffdd00', '#00fff2', '#3acc00', '#f200ff', '#cc0000'],
  colorSpeedActive: 0.5,

  idleIntensity: 0.15,
  baseIntensity: 0.4,
  maxIntensity: 0.8,
  idleSpeed: 0.001,
  activeSpeed: 0.004,
  animationSpeed: 1.0,
  mouseInfluence: 1.0,
  mouseRadius: 0.5,

  explosionAttack: 5.0,      // мгновенный
  explosionDecay: 0.15,       // очень медленное затухание
  explosionDuration: 0,

  pulseAttack: 3.0,
  pulseDecay: 1.5,
  pulseDuration: 600,
  pulseRingWidth: 0.02,
  pulseRingSpeed: 0.6,
  fadeSpeed: 0.5,
  iterations: 15,
  vignetteStrength: 1.0,
  layerScaleMultiplier: 1.2,

  noiseExponent: 2.0,      // было 3.0 — меньше степень = толще
  noiseThreshold: 0.3,     // было 0.5 — ниже порог = больше видно
  density: 0.5,
  densityActive: 1



};

// ── Public API ──────────────────────────────────────

export interface DreamingShaderRef {
  /** Взрыв от центра */
  explode: () => void;
  /** Кольцевая пульсация */
  pulse: (strength?: number) => void;
  /** Плавное изменение яркости */
  setIntensity: (value: number) => void;
  setExplosion: (value: number) => void;
  setActive: (value: boolean) => void;

  /** Изменить скорость анимации */
  setSpeed: (value: number) => void;
  /** Сброс к idle */
  reset: () => void;
}

// ── Shaders ─────────────────────────────────────────

const vertexShader = `
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = 0.5 * (position + 1.0);
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision mediump float;
  varying vec2 vUv;
  uniform float u_time;
  uniform float u_ratio;
  uniform vec2 u_pointer;
  uniform float u_intensity;
  uniform float u_explosion;
  uniform float u_pulse;
  uniform float u_speed;
  uniform float u_mouse_influence;
  uniform float u_mouse_radius;
  uniform float u_vignette;
  uniform float u_noise_exp;
  uniform float u_noise_threshold;
  uniform float u_pulse_ring_width;
  uniform float u_pulse_ring_speed;
  uniform float u_layer_scale;
  uniform int u_iterations;

  uniform vec3 u_color_active_a;
  uniform vec3 u_color_active_b;
  uniform float u_color_active_mix;
  uniform float u_active;

  uniform vec3 u_color_a;
  uniform vec3 u_color_b;
  uniform float u_color_mix;
  uniform float u_density;


  vec2 rotate(vec2 uv, float th) {
    return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
  }

  float neuro_shape(vec2 uv, float t, float p) {
    vec2 sine_acc = vec2(0.);
    vec2 res = vec2(0.);
    float scale = 8.;
    for (int j = 0; j < 20; j++) {
      if (j >= u_iterations) break;
      uv = rotate(uv, 1.);
      sine_acc = rotate(sine_acc, 1.);
      vec2 layer = uv * scale + float(j) + sine_acc - t;
      sine_acc += sin(layer) + 2.4 * p;
      res += (.5 + .5 * cos(layer)) / scale;
      scale *= u_layer_scale;
    }
    return res.x + res.y;
  }

  void main() {
    vec2 uv = .5 * vUv;
    uv.x *= u_ratio;

    vec2 pointer = vUv - u_pointer;
    pointer.x *= u_ratio;
    float p = clamp(length(pointer) / u_mouse_radius, 0., 1.);
    p = .5 * pow(1. - p, 2.) * u_mouse_influence;
    p += u_explosion * 1.5;

    float t = u_speed * u_time;

    float noise = neuro_shape(uv, t, p);
    noise = 1.2 * pow(noise, max(u_noise_exp, 1.0));
    noise += pow(noise, 10.);
    noise *= u_density + 1.0;                              // ← множитель вместо smoothstep
    noise = max(.0, noise - u_noise_threshold);



    float vignette = 1. - length(vUv - .5);
    vignette = mix(1.0, vignette, u_vignette);
    vignette = mix(vignette, 1.0, u_explosion * 0.5);
    noise *= vignette;

    float explosionDist = length(vUv - 0.5);
    float explosionCore = u_explosion * 3.0 * exp(-1.5 * explosionDist);
    float explosionRing = u_explosion * 2.0 * exp(-10.0 * pow(explosionDist - u_explosion * 0.4, 2.0));
    float explosionFlood = u_explosion * u_explosion * 0.8;
    noise += explosionCore + explosionRing + explosionFlood;


    float dist = length(vUv - 0.5);
    float pulseRing = u_pulse * smoothstep(u_pulse_ring_width, 0.0, abs(dist - u_pulse * u_pulse_ring_speed));
    noise += pulseRing * 2.0;

    float accentMix = max(u_explosion, u_pulse);

    vec3 idleColor = mix(u_color_a, u_color_b, u_color_mix);
    vec3 activeColor = mix(u_color_active_a, u_color_active_b, u_color_active_mix);
    vec3 baseColor = mix(idleColor, activeColor, u_active);
    vec3 color = baseColor * (1.0 + accentMix * 0.3);


    noise *= u_intensity;
    color = color * noise;

    gl_FragColor = vec4(color, noise);
  }
`;

// ── Props ───────────────────────────────────────────

interface Props {
  config?: DreamingShaderConfig;
  className?: string;
  style?: React.CSSProperties;
}

// ── Component ───────────────────────────────────────

export const DreamingShader = forwardRef<DreamingShaderRef, Props>(
  ({ config: userConfig, className, style }, ref) => {
    const cfg = useMemo(() => ({ ...DEFAULTS, ...userConfig }), [userConfig]);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const glRef = useRef<WebGLRenderingContext | null>(null);
    const programRef = useRef<WebGLProgram | null>(null);
    const uniformsRef = useRef<Record<string, WebGLUniformLocation | null>>({});
    const rafRef = useRef<number>(0);
    const startTimeRef = useRef(Date.now());
    const mouseRef = useRef({ x: 0.5, y: 0.5 });
    const cfgRef = useRef(cfg);
    cfgRef.current = cfg;

    const stateRef = useRef({
      intensity: cfg.idleIntensity,
      explosion: 0,
      pulse: 0,
      speed: cfg.idleSpeed,
      targetIntensity: cfg.idleIntensity,
      targetExplosion: 0,
      targetPulse: 0,
      targetSpeed: cfg.idleSpeed,
      active: 0,
      targetActive: 0,
      density: cfg.density,
      targetDensity: cfg.density,

    });

    // ── Imperative API ──────────────────────────────

    useImperativeHandle(ref, () => ({
      explode: () => {
        const state = stateRef.current;
        state.targetExplosion = 1;
        state.explosion = 0.5;        // ← стартует уже с 0.5, не с 0
        state.active = 1;             // ← моментально, без lerp
        state.targetActive = 1;

      },

      pulse: (strength = 0.7) => {
        const state = stateRef.current;
        const c = cfgRef.current;
        state.targetPulse = Math.min(1, Math.max(0, strength));
        setTimeout(() => { state.targetPulse = 0; }, c.pulseDuration);
      },

      setExplosion: (value: number) => {
        stateRef.current.targetExplosion = Math.min(1, Math.max(0, value));
      },

      setIntensity: (value: number) => {
        stateRef.current.targetIntensity = Math.min(1, Math.max(0, value));
      },

      setSpeed: (value: number) => {
        stateRef.current.targetSpeed = Math.max(0, value);
      },
      setActive: (value: boolean) => {
        stateRef.current.targetActive = value ? 1 : 0;

        stateRef.current.density = cfgRef.current.densityActive;  // ← моментально густо
        stateRef.current.targetDensity = cfgRef.current.densityActive;
      },

      reset: () => {
        const state = stateRef.current;
        const c = cfgRef.current;
        state.targetIntensity = c.idleIntensity;
        state.targetSpeed = c.idleSpeed;
        state.targetExplosion = 0;
        state.targetPulse = 0;
      },
    }), []);

    // ── WebGL ───────────────────────────────────────

    useEffect(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
      if (!gl) return;
      glRef.current = gl;

      const vs = compileShader(gl, gl.VERTEX_SHADER, vertexShader);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader);
      if (!vs || !fs) return;

      const program = gl.createProgram()!;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Shader link error:', gl.getProgramInfoLog(program));
        return;
      }

      programRef.current = program;
      gl.useProgram(program);

      const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const pos = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

      const uNames = [
        'u_time', 'u_ratio', 'u_pointer', 'u_intensity',
        'u_explosion', 'u_pulse', 'u_speed',
        'u_mouse_influence', 'u_mouse_radius', 'u_vignette',
        'u_noise_exp', 'u_noise_threshold',
        'u_pulse_ring_width', 'u_pulse_ring_speed', 'u_layer_scale',
        'u_iterations',
        'u_density',
        'u_color_a', 'u_color_b', 'u_color_mix',
        'u_color_active_a', 'u_color_active_b', 'u_color_active_mix', 'u_active',

      ];
      for (const name of uNames) {
        uniformsRef.current[name] = gl.getUniformLocation(program, name);
      }

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const resize = () => {
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        gl.viewport(0, 0, canvas.width, canvas.height);
      };

      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();

      const onMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        mouseRef.current = {
          x: (e.clientX - rect.left) / rect.width,
          y: 1 - (e.clientY - rect.top) / rect.height,
        };
      };
      canvas.addEventListener('mousemove', onMove);

      let lastTime = performance.now();

      const animate = () => {
        if (!glRef.current || !programRef.current) return;

        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const c = cfgRef.current;
        const state = stateRef.current;

        state.intensity += (state.targetIntensity - state.intensity) * dt * c.fadeSpeed;
        state.explosion += (state.targetExplosion - state.explosion) * dt *
          (state.targetExplosion > state.explosion ? c.explosionAttack : c.explosionDecay);
        state.pulse += (state.targetPulse - state.pulse) * dt *
          (state.targetPulse > state.pulse ? c.pulseAttack : c.pulseDecay);
        state.speed += (state.targetSpeed - state.speed) * dt * 2;

        const u = uniformsRef.current;
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        const ratio = canvas.width / canvas.height || 1;

        gl.uniform1f(u.u_time, elapsed * 1000 * c.animationSpeed);
        gl.uniform1f(u.u_ratio, ratio);
        gl.uniform2f(u.u_pointer, mouseRef.current.x, mouseRef.current.y);
        gl.uniform1f(u.u_intensity, state.intensity);
        gl.uniform1f(u.u_explosion, state.explosion);
        gl.uniform1f(u.u_pulse, state.pulse);
        gl.uniform1f(u.u_speed, state.speed);
        gl.uniform1f(u.u_mouse_influence, c.mouseInfluence);
        gl.uniform1f(u.u_mouse_radius, c.mouseRadius);
        gl.uniform1f(u.u_vignette, c.vignetteStrength);
        gl.uniform1f(u.u_noise_exp, c.noiseExponent);
        gl.uniform1f(u.u_noise_threshold, c.noiseThreshold);
        gl.uniform1f(u.u_pulse_ring_width, c.pulseRingWidth);
        gl.uniform1f(u.u_pulse_ring_speed, c.pulseRingSpeed);
        gl.uniform1f(u.u_layer_scale, c.layerScaleMultiplier);

        state.targetDensity = state.targetActive > 0.5 ? c.densityActive : c.density;
        state.density += (state.targetDensity - state.density) * dt * 2.0;

        gl.uniform1f(u.u_density, state.density);

        gl.uniform1i(u.u_iterations, c.iterations);

        const colors = c.colors.map(hexToRgb);
        const colorTime = elapsed * c.colorSpeed;
        const colorIndex = colorTime % colors.length;
        const colorA = colors[Math.floor(colorIndex) % colors.length];
        const colorB = colors[Math.ceil(colorIndex) % colors.length];
        const colorMix = colorIndex % 1;


        gl.uniform3fv(u.u_color_a, colorA);
        gl.uniform3fv(u.u_color_b, colorB);
        gl.uniform1f(u.u_color_mix, colorMix);


        state.active += (state.targetActive - state.active) * dt * 2.0;

        // Active colors
        const activeColors = c.colorsActive.map(hexToRgb);
        const activeColorTime = elapsed * c.colorSpeedActive;
        const activeIndex = activeColorTime % activeColors.length;
        const activeA = activeColors[Math.floor(activeIndex) % activeColors.length];
        const activeB = activeColors[Math.ceil(activeIndex) % activeColors.length];
        const activeMix = activeIndex % 1;

        gl.uniform3fv(u.u_color_active_a, activeA);
        gl.uniform3fv(u.u_color_active_b, activeB);
        gl.uniform1f(u.u_color_active_mix, activeMix);
        gl.uniform1f(u.u_active, state.active);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        // console.log('state:', {
        //   intensity: state.intensity.toFixed(3),
        //   active: state.active.toFixed(3),
        //   explosion: state.explosion.toFixed(3),
        // });

        rafRef.current = requestAnimationFrame(animate);
      };

      rafRef.current = requestAnimationFrame(animate);

      return () => {
        cancelAnimationFrame(rafRef.current);
        observer.disconnect();
        canvas.removeEventListener('mousemove', onMove);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      };
    }, []);

    return (
      <div
        ref={containerRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          ...style,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0, display: 'block' }}
        />
      </div>
    );
  }
);

DreamingShader.displayName = 'DreamingShader';

// ── Helpers ─────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
  ];
}