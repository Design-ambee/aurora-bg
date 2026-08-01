/* Aurora dot-grid background
 * Reads all settings from data-attributes so they can be bound to Webflow CMS fields.
 * Initialises every [data-aurora] canvas on the page.
 *
 * <canvas data-aurora data-colors="#E0FC73,#CCF040,#A1C516"></canvas>
 */
(function () {
  'use strict';

  var DEFAULTS = {
    colors: ['#E0FC73', '#CCF040', '#A1C516'],
    span: 0.8,
    amplitude: 0.06,
    blend: 0.85,
    speed: 0.5,
    drift: 0.45,
    contrast: 0.0,
    dotSize: 2,
    dotSpacing: 6,
    gain: 1.0,
    hoverRadius: 130,  // reach of the cursor effect, CSS px · 0 disables it
    hoverGrow: 0.6,    // how much dots swell at the centre of the cursor
    hoverEase: 0.12    // cursor follow damping · lower = laggier, softer
  };

  var VERT =
    '#version 300 es\n' +
    'in vec2 position;\n' +
    'void main() { gl_Position = vec4(position, 0.0, 1.0); }';

  var FRAG =
  '#version 300 es\n' +
  'precision highp float;\n' +
  'uniform float uTime;\n' +
  'uniform float uAmplitude;\n' +
  'uniform vec3 uColorStops[3];\n' +
  'uniform vec2 uResolution;\n' +
  'uniform float uBlend;\n' +
  'uniform float uSpan;\n' +
  'uniform float uDrift;\n' +
  'uniform float uContrast;\n' +
  'uniform float uDotSpacing;\n' +
  'uniform float uDotRadius;\n' +
  'uniform float uGain;\n' +
  'uniform vec2 uMouse;\n' +
  'uniform float uHoverRadius;\n' +
  'uniform float uHoverAmt;\n' +
  'uniform float uHoverGrow;\n' +
  'out vec4 fragColor;\n' +
  'vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }\n' +
  'float snoise(vec2 v){\n' +
  '  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);\n' +
  '  vec2 i  = floor(v + dot(v, C.yy));\n' +
  '  vec2 x0 = v - i + dot(i, C.xx);\n' +
  '  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);\n' +
  '  vec4 x12 = x0.xyxy + C.xxzz;\n' +
  '  x12.xy -= i1;\n' +
  '  i = mod(i, 289.0);\n' +
  '  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));\n' +
  '  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);\n' +
  '  m = m * m; m = m * m;\n' +
  '  vec3 x = 2.0 * fract(p * C.www) - 1.0;\n' +
  '  vec3 h = abs(x) - 0.5;\n' +
  '  vec3 ox = floor(x + 0.5);\n' +
  '  vec3 a0 = x - ox;\n' +
  '  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);\n' +
  '  vec3 g;\n' +
  '  g.x  = a0.x  * x0.x  + h.x  * x0.y;\n' +
  '  g.yz = a0.yz * x12.xz + h.yz * x12.yw;\n' +
  '  return 130.0 * dot(m, g);\n' +
  '}\n' +
  'struct ColorStop { vec3 color; float position; };\n' +
  '#define COLOR_RAMP(colors, factor, finalColor) {                    \\\n' +
  '  int index = 0;                                                    \\\n' +
  '  for (int i = 0; i < 2; i++) {                                     \\\n' +
  '     ColorStop currentColor = colors[i];                            \\\n' +
  '     bool isInBetween = currentColor.position <= factor;            \\\n' +
  '     index = int(mix(float(index), float(i), float(isInBetween)));   \\\n' +
  '  }                                                                 \\\n' +
  '  ColorStop currentColor = colors[index];                           \\\n' +
  '  ColorStop nextColor = colors[index + 1];                          \\\n' +
  '  float range = nextColor.position - currentColor.position;         \\\n' +
  '  float lerpFactor = (factor - currentColor.position) / range;      \\\n' +
  '  finalColor = mix(currentColor.color, nextColor.color, lerpFactor);\\\n' +
  '}\n' +
  'void main() {\n' +
  '  vec2 uv = gl_FragCoord.xy / uResolution;\n' +
  '  ColorStop colors[3];\n' +
  '  colors[0] = ColorStop(uColorStops[0], 0.0);\n' +
  '  colors[1] = ColorStop(uColorStops[1], 0.5);\n' +
  '  colors[2] = ColorStop(uColorStops[2], 1.0);\n' +
  '  vec3 rampColor;\n' +
  '  float d = uv.y;\n' +
  '  float wave = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * uAmplitude;\n' +
  '  float horizon = max(uSpan * (1.0 + wave), 0.001);\n' +
  '  float t = clamp(1.0 - d / horizon, 0.0, 1.0);\n' +
  '  float auroraAlpha = smoothstep(0.0, uBlend, t);\n' +
  '  float rampT = t + snoise(vec2(uv.x * 1.6, uTime * 0.9)) * uDrift;\n' +
  '  rampT = clamp(rampT, 0.0, 1.0);\n' +
  '  rampT = mix(rampT, smoothstep(0.0, 1.0, rampT), uContrast);\n' +
  '  COLOR_RAMP(colors, rampT, rampColor);\n' +
  // Work from the dot's centre rather than the raw fragment, so the whole
  // dot reacts as one unit instead of shading across its own width.
  '  vec2 cellIndex = floor(gl_FragCoord.xy / uDotSpacing);\n' +
  '  vec2 dotCenter = (cellIndex + 0.5) * uDotSpacing;\n' +
  '  vec2 cell = gl_FragCoord.xy - dotCenter;\n' +
  '  float hover = 0.0;\n' +
  '  if (uHoverRadius > 0.0) {\n' +
  '    hover = 1.0 - smoothstep(0.0, uHoverRadius, distance(dotCenter, uMouse));\n' +
  '    hover = hover * hover * uHoverAmt;\n' + // squared = tighter, less mushy falloff
  '  }\n' +
  '  float radius = uDotRadius * (1.0 + hover * uHoverGrow);\n' +
  '  float dotMask = 1.0 - smoothstep(radius - 0.5, radius + 0.5, length(cell));\n' +
  // Colour is deliberately untouched by hover — only the radius above
  // responds, so dots grow without shifting tone.
  '  vec3 auroraColor = rampColor * uGain;\n' +
  '  float a = auroraAlpha * dotMask;\n' +
  '  fragColor = vec4(auroraColor * a, a);\n' +
  '}';

  function hexToRgb(hex) {
    var h = String(hex).trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return [1, 1, 1];
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Reads a data-attribute, falling back to the default if absent or unparseable.
  // Empty CMS fields render as empty strings, so those fall back too.
  function num(el, attr, fallback) {
    var v = parseFloat(el.getAttribute(attr));
    return isNaN(v) ? fallback : v;
  }

  function readConfig(el) {
    var raw = (el.getAttribute('data-colors') || '').trim();
    var colors = raw
      ? raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
      : [];
    // Pad or trim to exactly three stops.
    while (colors.length && colors.length < 3) colors.push(colors[colors.length - 1]);
    if (colors.length !== 3) colors = DEFAULTS.colors.slice();

    return {
      colors: colors,
      span: num(el, 'data-span', DEFAULTS.span),
      amplitude: num(el, 'data-amplitude', DEFAULTS.amplitude),
      blend: num(el, 'data-blend', DEFAULTS.blend),
      speed: num(el, 'data-speed', DEFAULTS.speed),
      drift: num(el, 'data-drift', DEFAULTS.drift),
      contrast: num(el, 'data-contrast', DEFAULTS.contrast),
      dotSize: num(el, 'data-dot-size', DEFAULTS.dotSize),
      dotSpacing: num(el, 'data-dot-spacing', DEFAULTS.dotSpacing),
      gain: num(el, 'data-gain', DEFAULTS.gain),
      hoverRadius: num(el, 'data-hover-radius', DEFAULTS.hoverRadius),
      hoverGrow: num(el, 'data-hover-grow', DEFAULTS.hoverGrow),
      hoverEase: num(el, 'data-hover-ease', DEFAULTS.hoverEase)
    };
  }

  function init(canvas) {
    if (canvas.__auroraInit) return;
    canvas.__auroraInit = true;

    var cfg = readConfig(canvas);
    var gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true
    });
    if (!gl) return;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Aurora shader:', gl.getShaderInfoLog(s));
      }
      return s;
    }

    var program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    gl.useProgram(program);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var pos = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    function loc(n) { return gl.getUniformLocation(program, n); }
    var U = {
      uTime: loc('uTime'),
      uAmplitude: loc('uAmplitude'),
      uColorStops: loc('uColorStops'),
      uResolution: loc('uResolution'),
      uBlend: loc('uBlend'),
      uSpan: loc('uSpan'),
      uDrift: loc('uDrift'),
      uContrast: loc('uContrast'),
      uDotSpacing: loc('uDotSpacing'),
      uDotRadius: loc('uDotRadius'),
      uGain: loc('uGain'),
      uMouse: loc('uMouse'),
      uHoverRadius: loc('uHoverRadius'),
      uHoverAmt: loc('uHoverAmt'),
      uHoverGrow: loc('uHoverGrow')
    };

    var stops = new Float32Array(
      cfg.colors.reduce(function (acc, hex) { return acc.concat(hexToRgb(hex)); }, [])
    );
    gl.uniform3fv(U.uColorStops, stops);
    gl.uniform1f(U.uAmplitude, cfg.amplitude);
    gl.uniform1f(U.uBlend, cfg.blend);
    gl.uniform1f(U.uSpan, cfg.span);
    gl.uniform1f(U.uDrift, cfg.drift);
    gl.uniform1f(U.uContrast, cfg.contrast);
    gl.uniform1f(U.uGain, cfg.gain);
    gl.uniform1f(U.uHoverGrow, cfg.hoverGrow);

    var curDpr = 1;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(1, Math.floor(rect.width * dpr));
      var h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width === w && canvas.height === h) return;
      curDpr = dpr;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uResolution, w, h);
      var spacing = Math.max(2, Math.round(cfg.dotSpacing * dpr));
      gl.uniform1f(U.uDotSpacing, spacing);
      gl.uniform1f(U.uDotRadius, (cfg.dotSize * dpr) * 0.5);
      gl.uniform1f(U.uHoverRadius, cfg.hoverRadius * dpr);
    }

    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var speed = reduceMotion ? 0 : cfg.speed;

    // ---- Cursor tracking ----
    // The canvas is pointer-events:none so it never receives events itself.
    // Listening on window and converting against its rect keeps the canvas
    // click-through while still following the cursor over it.
    var mx = -9999, my = -9999;      // eased position, CSS px, canvas-local
    var tx = -9999, ty = -9999;      // raw target
    var amt = 0, tamt = 0;           // presence, fades the effect in and out
    var hoverOn = cfg.hoverRadius > 0 &&
                  !reduceMotion &&
                  window.matchMedia('(pointer: fine)').matches;

    if (hoverOn) {
      window.addEventListener('pointermove', function (e) {
        var r = canvas.getBoundingClientRect();
        var x = e.clientX - r.left;
        var y = e.clientY - r.top;
        var inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
        if (inside) {
          // First entry: jump rather than ease in from the last known point,
          // otherwise the bloom visibly slides in from off screen.
          if (tamt === 0) { mx = x; my = y; }
          tx = x; ty = y; tamt = 1;
        } else {
          tamt = 0;
        }
      }, { passive: true });

      window.addEventListener('blur', function () { tamt = 0; });
    }

    var rafId = 0;
    var running = false;

    function frame(t) {
      rafId = requestAnimationFrame(frame);

      if (hoverOn) {
        var e = cfg.hoverEase;
        mx += (tx - mx) * e;
        my += (ty - my) * e;
        amt += (tamt - amt) * e;
        // gl_FragCoord counts up from the bottom; pointer Y counts down.
        gl.uniform2f(U.uMouse, mx * curDpr, canvas.height - my * curDpr);
        gl.uniform1f(U.uHoverAmt, amt);
      }

      gl.uniform1f(U.uTime, t * 0.01 * speed * 0.1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function start() {
      if (running) return;
      running = true;
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
    }

    // Only animate while on screen and while the tab is visible.
    // Matters in Collection Lists, where several instances can exist at once.
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting && !document.hidden ? start() : stop();
      }, { rootMargin: '100px' }).observe(canvas);
    } else {
      start();
    }

    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : start();
    });
  }

  function initAll() {
    var nodes = document.querySelectorAll('canvas[data-aurora]');
    for (var i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Expose for manual re-init after CMS filtering / pagination swaps the DOM.
  window.Aurora = { init: initAll };
})();
