import { GamepadEngine } from './gamepadEngine.js';
import { TargetRange } from './targetRange.js';
import { AutoTunerEngine } from './autoTunerEngine.js';
import { coach } from './aimCoach.js';
import { sound } from './soundEngine.js';
import confetti from 'canvas-confetti';

// Setup core instances
const engine = new GamepadEngine();
let range = null;
let autoTuner = null;

// App Root UI Template
const appEl = document.getElementById('app');

appEl.innerHTML = `
  <div class="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
    
    <!-- 3D Canvas Viewport (Full Screen) -->
    <div id="canvas-container" class="absolute inset-0 w-full h-full cursor-crosshair z-0"></div>

    <!-- Reticle Overlay in the center -->
    <div class="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
      <div id="crosshair-reticle" class="relative w-8 h-8 flex items-center justify-center">
        <!-- Center Dot -->
        <div id="reticle-dot" class="w-2 h-2 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]"></div>
        <!-- Spokes -->
        <div class="absolute -top-3 w-0.5 h-2 bg-cyan-400/90 shadow-[0_0_4px_#22d3ee]"></div>
        <div class="absolute -bottom-3 w-0.5 h-2 bg-cyan-400/90 shadow-[0_0_4px_#22d3ee]"></div>
        <div class="absolute -left-3 h-0.5 w-2 bg-cyan-400/90 shadow-[0_0_4px_#22d3ee]"></div>
        <div class="absolute -right-3 h-0.5 w-2 bg-cyan-400/90 shadow-[0_0_4px_#22d3ee]"></div>
        <div id="hit-marker" class="absolute w-8 h-8 border-2 border-transparent rotate-45 hidden pointer-events-none"></div>
      </div>
    </div>

    <!-- Top Floating Header -->
    <header class="absolute top-4 left-6 right-6 flex items-center justify-between z-20 pointer-events-none">
      
      <!-- Brand & Title -->
      <div class="flex items-center gap-3 pointer-events-auto glass-panel px-4 py-2 rounded-2xl shadow-xl">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <svg class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
        </div>
        <div>
          <h1 class="font-heading text-sm font-bold tracking-wider text-slate-100 flex items-center gap-2">
            CONTROLLER AIM LAB
            <span class="text-[9px] font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">AI COACH</span>
          </h1>
          <p class="text-[11px] text-slate-400">Aim Analysis, Target Studio & Telemetry Auto-Fix</p>
        </div>
      </div>

      <!-- Live Session Score & Stats Pill -->
      <div class="glass-panel px-5 py-2 rounded-2xl flex items-center gap-6 shadow-2xl pointer-events-auto">
        <div>
          <span class="text-[9px] font-mono text-slate-400 uppercase tracking-widest block">Score</span>
          <span id="hud-score" class="font-heading text-xl font-bold text-cyan-400">0</span>
        </div>
        <div class="w-px h-6 bg-slate-800"></div>
        <div>
          <span class="text-[9px] font-mono text-slate-400 uppercase tracking-widest block">Accuracy</span>
          <span id="hud-accuracy" class="font-heading text-xl font-bold text-emerald-400">100%</span>
        </div>
        <div class="w-px h-6 bg-slate-800"></div>
        <div>
          <span class="text-[9px] font-mono text-slate-400 uppercase tracking-widest block">Reaction</span>
          <span id="hud-reaction" class="font-heading text-xl font-bold text-amber-400">0ms</span>
        </div>
        <div class="w-px h-6 bg-slate-800"></div>
        <div>
          <span class="text-[9px] font-mono text-slate-400 uppercase tracking-widest block">Time Left</span>
          <span id="hud-timer" class="font-heading text-xl font-bold text-rose-400">45s</span>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2.5 pointer-events-auto">
        
        <!-- AI COACH BUTTON -->
        <button id="btn-open-coach" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-1.5 active:scale-95">
          <svg class="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          <span>AI COACH</span>
        </button>

        <!-- AUTO-FIX SENSITIVITY HERO BUTTON -->
        <button id="btn-auto-tune" class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-500/30 transition-all flex items-center gap-1.5 border border-purple-400/30 active:scale-95">
          <svg class="w-4 h-4 text-purple-200 animate-spin" id="auto-tune-spin-icon" style="display: none;" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <svg class="w-4 h-4 text-yellow-300" id="auto-tune-wand-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span id="btn-auto-tune-text">AUTO-FIX</span>
        </button>

        <!-- Gamepad Status Pill -->
        <div id="controller-status-badge" class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono glass-panel shadow-lg transition-all">
          <span id="controller-dot" class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
          <span id="controller-name" class="text-slate-300 max-w-[110px] truncate">No Controller</span>
        </div>

        <!-- Audio Toggle -->
        <button id="btn-toggle-sound" class="p-2 rounded-xl glass-panel hover:bg-slate-800 text-slate-300 transition-colors shadow-lg" title="Toggle Sound">
          <svg id="sound-icon-on" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        </button>

        <!-- Open Drawer -->
        <button id="btn-toggle-settings" class="px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-1.5">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>STUDIO</span>
        </button>
      </div>
    </header>

    <!-- Live AI Coach Feedback Pill Banner (Non-blocking, updates on target hit) -->
    <div id="coach-live-banner" class="hidden absolute top-20 left-1/2 -translate-x-1/2 z-25 glass-panel border border-emerald-500/40 px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-4 transition-all duration-300">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="text-xs font-mono font-bold text-emerald-400">AI COACH</span>
      </div>
      <div class="h-4 w-px bg-slate-700"></div>
      <p id="coach-live-tip" class="text-xs text-slate-200 font-medium truncate max-w-[420px]">
        Aim calibrated. Continue firing!
      </p>
      <div class="h-4 w-px bg-slate-700"></div>
      <button id="coach-live-view-btn" class="text-[11px] font-mono font-bold text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
        VIEW DIAGNOSTICS &raquo;
      </button>
    </div>

    <!-- Calibration Live Status Banner (Single-Target Auto-Tuning) -->
    <div id="autotune-banner" class="hidden absolute top-20 left-1/2 -translate-x-1/2 z-30 glass-panel border border-purple-500/50 px-6 py-4 rounded-2xl shadow-2xl flex flex-col items-center gap-2 min-w-[440px]">
      <div class="flex items-center gap-3 w-full justify-between">
        <span class="text-xs font-mono font-bold text-purple-400 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-purple-400 animate-ping"></span>
          SINGLE-TARGET PRECISION TUNER
        </span>
        <button id="btn-cancel-autotune" class="text-xs text-slate-400 hover:text-rose-400 font-mono">Cancel</button>
      </div>
      <p id="autotune-instruction" class="text-sm font-semibold text-slate-100 text-center">
        Target 1/8: Acquire and shoot the target at your natural speed.
      </p>
      <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-1">
        <div id="autotune-progress-bar" class="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-150" style="width: 0%"></div>
      </div>
    </div>

    <!-- Bottom Controls: Mode Selector & Start Session -->
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
      <div class="glass-panel p-1.5 rounded-2xl flex items-center gap-1.5 shadow-2xl">
        <button data-mode="gridshot" class="mode-btn px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all bg-cyan-500 text-slate-950 shadow-md">Gridshot</button>
        <button data-mode="tracking" class="mode-btn px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all text-slate-300 hover:text-white hover:bg-slate-800">Tracking</button>
        <button data-mode="spidershot" class="mode-btn px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all text-slate-300 hover:text-white hover:bg-slate-800">SpiderShot</button>
        <button data-mode="free_calibrate" class="mode-btn px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all text-slate-300 hover:text-white hover:bg-slate-800">Free Practice</button>
      </div>

      <button id="btn-start-session" class="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs tracking-wider shadow-lg shadow-emerald-500/25 transition-transform active:scale-95 flex items-center gap-2">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        START SESSION
      </button>
    </div>

    <!-- Bottom Left: Controller Button Guide Pill -->
    <div class="absolute bottom-6 left-6 z-20 glass-panel px-3.5 py-2 rounded-xl text-[11px] font-mono text-slate-300 flex items-center gap-3 pointer-events-none shadow-xl flex-wrap max-w-[650px]">
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-cyan-400 font-bold">RT</kbd> Shoot</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-cyan-400 font-bold">LT</kbd> ADS</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-cyan-400 font-bold">A</kbd> Start Session / Confirm</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-rose-400 font-bold">B</kbd> Close / Back</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-purple-400 font-bold">X</kbd> Auto-Fix</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-emerald-400 font-bold">Y</kbd> AI Coach</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-amber-300 font-bold">LB / RB</kbd> Modes</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-sky-400 font-bold">START</kbd> Studio</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-teal-400 font-bold">SELECT</kbd> Sound</span>
      <span class="flex items-center gap-1.5"><kbd class="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-blue-400 font-bold">D-Pad</kbd> Presets</span>
    </div>

    <!-- Right Side Tuning, Radar & Target Studio Drawer (Slide-over) -->
    <aside id="tuning-drawer" class="fixed top-0 right-0 h-full w-[400px] glass-panel border-l border-slate-800 z-30 flex flex-col shadow-2xl transition-transform duration-300 ease-out translate-x-full">
      
      <!-- Drawer Header -->
      <div class="p-4 border-b border-slate-800 flex items-center justify-between">
        <h2 class="font-heading text-sm font-bold text-cyan-400 tracking-wider">AIM & TARGET STUDIO</h2>
        <button id="btn-close-drawer" class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Drawer Tabs -->
      <div class="flex border-b border-slate-800 text-xs font-semibold">
        <button id="tab-tuner" class="flex-1 py-2.5 border-b-2 border-cyan-400 text-cyan-400 bg-slate-800/40">SENSITIVITY</button>
        <button id="tab-target" class="flex-1 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200">TARGET CUSTOMIZER</button>
        <button id="tab-monitor" class="flex-1 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200">STICK RADAR</button>
      </div>

      <!-- Drawer Scrollable Body -->
      <div class="flex-1 overflow-y-auto p-4 space-y-5">
        
        <!-- Tab 1: Tuner Controls -->
        <div id="page-tuner" class="space-y-4">
          <!-- Presets -->
          <div class="space-y-1.5">
            <label class="text-[11px] font-mono uppercase text-slate-400 tracking-wider flex items-center justify-between">
              Game Presets
              <span class="text-[10px] text-cyan-400">Esports Configs</span>
            </label>
            <select id="preset-selector" class="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-400">
              <option value="call_of_duty_dynamic">Call of Duty (Dynamic S-Curve)</option>
              <option value="apex_legends_linear">Apex Legends (Linear Fast)</option>
              <option value="halo_exponential">Halo Infinite (Exponential 2.4)</option>
              <option value="fortnite_exponential">Fortnite (Expo 2.1 Smooth)</option>
              <option value="precision_flick">Esports Precision Flick</option>
              <option value="default">Default Balanced</option>
            </select>
          </div>

          <!-- Sensitivity Sliders -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-200">Sensitivity X (Horizontal)</span>
              <span id="val-sens-x" class="text-xs font-mono text-cyan-400">3.5</span>
            </div>
            <input id="slider-sens-x" type="range" min="1.0" max="10.0" step="0.1" value="3.5" class="w-full accent-cyan-400 cursor-pointer" />

            <div class="flex items-center justify-between pt-1">
              <span class="text-xs font-bold text-slate-200">Sensitivity Y (Vertical)</span>
              <span id="val-sens-y" class="text-xs font-mono text-cyan-400">2.8</span>
            </div>
            <input id="slider-sens-y" type="range" min="1.0" max="10.0" step="0.1" value="2.8" class="w-full accent-cyan-400 cursor-pointer" />

            <div class="flex items-center justify-between pt-1">
              <span class="text-xs font-bold text-slate-200">ADS Multiplier (Zoom Sens)</span>
              <span id="val-ads-mult" class="text-xs font-mono text-cyan-400">0.70x</span>
            </div>
            <input id="slider-ads-mult" type="range" min="0.2" max="1.5" step="0.05" value="0.70" class="w-full accent-cyan-400 cursor-pointer" />
          </div>

          <!-- Response Curve Graph -->
          <div class="space-y-2.5 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-200">Aim Response Curve</span>
              <span id="curve-badge" class="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 border border-cyan-500/30">EXPONENTIAL</span>
            </div>

            <div class="relative w-full h-32 bg-slate-950/90 rounded-lg border border-slate-800 overflow-hidden flex items-center justify-center">
              <svg id="curve-graph" viewBox="0 0 100 100" class="w-full h-full p-2 overflow-visible">
                <line x1="0" y1="100" x2="100" y2="100" stroke="#334155" stroke-width="0.8" />
                <line x1="0" y1="0" x2="100" y2="0" stroke="#334155" stroke-width="0.8" />
                <line x1="50" y1="0" x2="50" y2="100" stroke="#1e293b" stroke-width="0.5" stroke-dasharray="2,2" />
                <rect id="curve-deadzone-rect" x="0" y="0" width="8" height="100" fill="#f43f5e" fill-opacity="0.2" />
                <polyline id="curve-path" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
                <circle id="curve-live-dot" cx="0" cy="100" r="3.5" fill="#f43f5e" stroke="#ffffff" stroke-width="1" />
              </svg>
            </div>

            <div class="grid grid-cols-2 gap-2 pt-1">
              <button data-curve="exponential" class="curve-select-btn py-1.5 px-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:border-cyan-400">Exponential</button>
              <button data-curve="dynamic" class="curve-select-btn py-1.5 px-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-900 text-slate-400 hover:border-cyan-400">Dynamic (S)</button>
              <button data-curve="linear" class="curve-select-btn py-1.5 px-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-900 text-slate-400 hover:border-cyan-400">Linear (Raw)</button>
              <button data-curve="enhanced_pow" class="curve-select-btn py-1.5 px-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-900 text-slate-400 hover:border-cyan-400">Dual-Zone</button>
            </div>

            <div id="exponent-control" class="pt-1">
              <div class="flex justify-between text-xs">
                <span class="text-slate-400">Curve Exponent</span>
                <span id="val-curve-exp" class="font-mono text-cyan-400">2.20</span>
              </div>
              <input id="slider-curve-exp" type="range" min="1.0" max="3.5" step="0.05" value="2.2" class="w-full accent-cyan-400 cursor-pointer mt-1" />
            </div>
          </div>

          <!-- Deadzones -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <span class="text-xs font-bold text-slate-200 block">Deadzone Calibration</span>
            <div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">Stick Drift Deadzone</span>
                <span id="val-inner-dz" class="text-xs font-mono text-rose-400">8%</span>
              </div>
              <input id="slider-inner-dz" type="range" min="0.0" max="0.30" step="0.01" value="0.08" class="w-full accent-rose-400 cursor-pointer" />
            </div>

            <div>
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">Outer Turn Threshold</span>
                <span id="val-outer-dz" class="text-xs font-mono text-emerald-400">96%</span>
              </div>
              <input id="slider-outer-dz" type="range" min="0.80" max="1.0" step="0.01" value="0.96" class="w-full accent-emerald-400 cursor-pointer" />
            </div>

            <div class="flex items-center justify-between pt-1">
              <label class="text-xs text-slate-300 flex items-center gap-2 cursor-pointer">
                <input id="check-invert-y" type="checkbox" class="rounded accent-cyan-400" />
                Invert Y-Axis
              </label>
              <label class="text-xs text-slate-300 flex items-center gap-2 cursor-pointer">
                <input id="check-invert-x" type="checkbox" class="rounded accent-cyan-400" />
                Invert X-Axis
              </label>
            </div>
          </div>

          <!-- Smoothing -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-200">Aim Smoothing Filter</span>
              <span id="val-smooth" class="text-xs font-mono text-cyan-400">0.00</span>
            </div>
            <input id="slider-smooth" type="range" min="0.0" max="0.6" step="0.05" value="0.0" class="w-full accent-cyan-400 cursor-pointer" />
          </div>

          <!-- Over-Flick Edge Vibration Haptic Feedback -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-rose-500/30">
            <div class="flex items-center justify-between">
              <div>
                <span class="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Over-Flick Stick Limit Vibration
                </span>
                <span class="text-[10px] text-slate-400 block mt-0.5">Vibrates when thumbstick hits the physical outer rim</span>
              </div>
              <label class="relative inline-flex items-center cursor-pointer">
                <input id="check-overflick-vibe" type="checkbox" checked class="sr-only peer" />
                <div class="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>

            <div class="pt-1">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-400">Haptic Buzz Intensity</span>
                <span id="val-overflick-intensity" class="font-mono text-rose-400 font-bold">100% (MAX)</span>
              </div>
              <input id="slider-overflick-intensity" type="range" min="0.2" max="1.0" step="0.05" value="1.0" class="w-full accent-rose-400 cursor-pointer mt-1" />
            </div>
          </div>

          <!-- Rumble Button -->
          <button id="btn-test-rumble" class="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition-colors flex items-center justify-center gap-2">
            <svg class="w-3.5 h-3.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            TEST RUMBLE VIBRATION
          </button>
        </div>

        <!-- Tab 2: TARGET CUSTOMIZER & SPACING -->
        <div id="page-target" class="space-y-4 hidden">
          
          <!-- Dynamic Object Tracking Speed & Direction Change (Configurable Follower) -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-emerald-500/30">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                Tracking Object Speed
              </span>
              <span id="val-tracking-speed" class="text-xs font-mono text-emerald-400">4.5 m/s</span>
            </div>
            <input id="slider-tracking-speed" type="range" min="1.0" max="12.0" step="0.5" value="4.5" class="w-full accent-emerald-400 cursor-pointer" />
            
            <div class="pt-1">
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-300">Direction Change Agility</span>
                <span id="val-tracking-agility" class="text-xs font-mono text-cyan-400">1.8x (Erratic)</span>
              </div>
              <input id="slider-tracking-agility" type="range" min="0.5" max="4.0" step="0.1" value="1.8" class="w-full accent-cyan-400 cursor-pointer mt-1" />
              <p class="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Controls how fast and unpredictably the target switches random 3D flight directions.
              </p>
            </div>

            <div class="grid grid-cols-3 gap-1.5 pt-1">
              <button data-speed="2.5" data-agility="1.0" class="btn-tracking-preset py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300">Smooth (2.5m/s)</button>
              <button data-speed="4.5" data-agility="1.8" class="btn-tracking-preset py-1 rounded bg-emerald-500/20 text-emerald-300 text-[10px] border border-emerald-500/40">Standard (4.5m/s)</button>
              <button data-speed="8.0" data-agility="3.0" class="btn-tracking-preset py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300">Apex Fast (8.0m/s)</button>
            </div>
          </div>

          <!-- Target Spacing & Distribution (Anti-Overlap) -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-cyan-500/30">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-cyan-400"></span>
                Target Spacing & Arena Spread
              </span>
              <span id="val-target-spread" class="text-xs font-mono text-cyan-400">1.2x (Wide)</span>
            </div>
            <input id="slider-target-spread" type="range" min="0.6" max="2.4" step="0.1" value="1.2" class="w-full accent-cyan-400 cursor-pointer" />
            
            <div class="pt-1">
              <div class="flex items-center justify-between">
                <span class="text-xs text-slate-300">Min Separation (Anti-Overlap Guarantee)</span>
                <span id="val-target-sep" class="text-xs font-mono text-emerald-400">2.2m (No Clumping)</span>
              </div>
              <input id="slider-target-sep" type="range" min="1.4" max="4.0" step="0.2" value="2.2" class="w-full accent-emerald-400 cursor-pointer mt-1" />
              <p class="text-[10px] text-slate-400 mt-1 leading-relaxed">
                Prevents targets from crowding or overlapping with zero occlusion.
              </p>
            </div>
          </div>

          <!-- Target Size Scale -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-200">Target Size & Scale</span>
              <span id="val-target-size" class="text-xs font-mono text-cyan-400">1.0x (Standard)</span>
            </div>
            <input id="slider-target-size" type="range" min="0.4" max="1.8" step="0.1" value="1.0" class="w-full accent-cyan-400 cursor-pointer" />
            
            <div class="grid grid-cols-3 gap-1.5 pt-1">
              <button data-size="0.5" class="btn-quick-size py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300">Micro (0.5x)</button>
              <button data-size="1.0" class="btn-quick-size py-1 rounded bg-cyan-500/20 text-cyan-300 text-[10px] border border-cyan-500/40">Standard (1.0x)</button>
              <button data-size="1.5" class="btn-quick-size py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300">Chunky (1.5x)</button>
            </div>
          </div>

          <!-- Target Shape -->
          <div class="space-y-2 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <span class="text-xs font-bold text-slate-200 block">3D Target Geometry</span>
            <div class="grid grid-cols-3 gap-2">
              <button data-shape="sphere" class="target-shape-btn py-2 px-1 rounded-xl text-xs font-semibold border border-cyan-400 bg-slate-800 text-cyan-300">Sphere</button>
              <button data-shape="cube" class="target-shape-btn py-2 px-1 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-900 text-slate-400 hover:border-cyan-400">Cyber Cube</button>
              <button data-shape="octahedron" class="target-shape-btn py-2 px-1 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-900 text-slate-400 hover:border-cyan-400">Diamond (Octa)</button>
            </div>
          </div>

          <!-- Color Customizer -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <span class="text-xs font-bold text-slate-200 block">Color Theme</span>
            
            <div class="flex items-center justify-between">
              <span class="text-xs text-slate-300">Target Body Color</span>
              <div class="flex items-center gap-2">
                <input id="color-target-primary" type="color" value="#06b6d4" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0" />
                <span id="lbl-target-primary" class="text-xs font-mono text-slate-400">#06b6d4</span>
              </div>
            </div>

            <div class="flex items-center justify-between pt-1">
              <span class="text-xs text-slate-300">Headshot Core (Bullseye)</span>
              <div class="flex items-center gap-2">
                <input id="color-target-core" type="color" value="#f43f5e" class="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0" />
                <span id="lbl-target-core" class="text-xs font-mono text-slate-400">#f43f5e</span>
              </div>
            </div>

            <!-- Quick Color Palettes -->
            <div class="pt-2">
              <span class="text-[10px] font-mono uppercase text-slate-400 block mb-1.5">Preset Themes</span>
              <div class="grid grid-cols-2 gap-2 text-xs">
                <button data-theme="cyber_cyan" class="btn-theme-preset py-1.5 px-2 rounded-lg bg-slate-800 text-cyan-400 border border-slate-700 hover:border-cyan-400 flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-cyan-400"></span> Cyber Neon
                </button>
                <button data-theme="emerald_lime" class="btn-theme-preset py-1.5 px-2 rounded-lg bg-slate-800 text-emerald-400 border border-slate-700 hover:border-emerald-400 flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-emerald-400"></span> Toxic Lime
                </button>
                <button data-theme="amber_solar" class="btn-theme-preset py-1.5 px-2 rounded-lg bg-slate-800 text-amber-400 border border-slate-700 hover:border-amber-400 flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-amber-400"></span> Solar Flare
                </button>
                <button data-theme="violet_synth" class="btn-theme-preset py-1.5 px-2 rounded-lg bg-slate-800 text-purple-400 border border-slate-700 hover:border-purple-400 flex items-center gap-2">
                  <span class="w-3 h-3 rounded-full bg-purple-400"></span> Synthwave
                </button>
              </div>
            </div>
          </div>

          <!-- Glow Intensity -->
          <div class="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
            <div class="flex items-center justify-between">
              <span class="text-xs font-bold text-slate-200">Glow & Emissive Bloom</span>
              <span id="val-target-glow" class="text-xs font-mono text-cyan-400">80%</span>
            </div>
            <input id="slider-target-glow" type="range" min="0.2" max="1.5" step="0.1" value="0.8" class="w-full accent-cyan-400 cursor-pointer" />
          </div>

          <button id="btn-apply-target-custom" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold text-xs tracking-wider shadow-lg shadow-cyan-500/20 active:scale-95 transition-all">
            UPDATE TARGETS IN REAL-TIME
          </button>
        </div>

        <!-- Tab 3: Live Radar -->
        <div id="page-monitor" class="space-y-4 hidden">
          <div class="flex justify-center pt-2">
            <div class="relative w-48 h-48 rounded-full border-2 border-slate-700 bg-slate-900/90 flex items-center justify-center overflow-hidden">
              <div class="absolute inset-x-0 h-px bg-slate-800"></div>
              <div class="absolute inset-y-0 w-px bg-slate-800"></div>
              <div id="radar-deadzone-ring" class="absolute rounded-full border border-rose-500/50 bg-rose-500/10" style="width: 16%; height: 16%;"></div>
              <div id="radar-outer-ring" class="absolute rounded-full border border-emerald-500/50" style="width: 96%; height: 96%;"></div>
              <div id="radar-stick-dot" class="absolute w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-[0_0_10px_#22d3ee] -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2"></div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs font-mono">
            <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span class="text-slate-400 block text-[10px]">STICK (X, Y)</span>
              <span id="telemetry-raw-pos" class="text-cyan-300">0.00, 0.00</span>
            </div>
            <div class="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span class="text-slate-400 block text-[10px]">OUTPUT MAG</span>
              <span id="telemetry-out-mag" class="text-emerald-300">0.00</span>
            </div>
          </div>
        </div>

      </div>
    </aside>

    <!-- AI AIM COACH MODAL -->
    <div id="coach-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
      <div class="glass-panel border border-emerald-500/40 p-6 rounded-2xl max-w-xl w-full shadow-2xl space-y-4 glow-emerald max-h-[90vh] overflow-y-auto">
        
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-slate-950 flex items-center justify-center font-bold shadow-lg shadow-emerald-500/20">
              <svg class="w-5 h-5 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 class="font-heading text-lg font-bold text-white flex items-center gap-2">
                AI AIM COACH
                <span id="coach-grade-badge" class="text-xs px-2 py-0.5 rounded border font-mono">B+ (Master)</span>
              </h3>
              <p class="text-xs text-slate-400">Thumbstick Kinematics & Precision Improvement Plan</p>
            </div>
          </div>
          <button id="btn-close-coach" class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>

        <div class="bg-gradient-to-r from-emerald-950/40 to-slate-900/60 p-4 rounded-xl border border-emerald-500/30">
          <span class="text-[10px] font-mono uppercase text-emerald-400 font-bold block mb-1">Coach Verdict</span>
          <p id="coach-verdict-text" class="text-xs text-slate-200 leading-relaxed font-medium">
            Analyzing your mechanical input patterns...
          </p>
        </div>

        <!-- High Level Metrics -->
        <div class="grid grid-cols-4 gap-2 text-center text-xs font-mono">
          <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span class="text-slate-400 text-[10px] block">ACCURACY</span>
            <span id="coach-stat-acc" class="font-bold text-emerald-400 text-sm">--%</span>
          </div>
          <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span class="text-slate-400 text-[10px] block">REACTION</span>
            <span id="coach-stat-react" class="font-bold text-amber-400 text-sm">--ms</span>
          </div>
          <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span class="text-slate-400 text-[10px] block">HEADSHOT CORE</span>
            <span id="coach-stat-hs" class="font-bold text-rose-400 text-sm">--%</span>
          </div>
          <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span class="text-slate-400 text-[10px] block">MAX STREAK</span>
            <span id="coach-stat-streak" class="font-bold text-cyan-400 text-sm">0</span>
          </div>
        </div>

        <!-- Continuous Kinematics Movement Telemetry -->
        <div class="bg-slate-900/70 p-3.5 rounded-xl border border-cyan-500/20 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono uppercase text-cyan-400 font-bold flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              Full Trajectory & Kinematics Movement Analysis
            </span>
            <span id="coach-kinematics-rate" class="text-[10px] font-mono text-slate-400">60Hz Real-Time</span>
          </div>

          <div class="grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div class="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              <span class="text-slate-400 text-[9px] block">SMOOTHNESS</span>
              <span id="coach-kin-smoothness" class="font-bold text-cyan-400 text-sm">--%</span>
            </div>
            <div class="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              <span class="text-slate-400 text-[9px] block">PATH EFFICIENCY</span>
              <span id="coach-kin-efficiency" class="font-bold text-emerald-400 text-sm">--%</span>
            </div>
            <div class="bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              <span class="text-slate-400 text-[9px] block">STICK SATURATION</span>
              <span id="coach-kin-pegging" class="font-bold text-purple-400 text-sm">--%</span>
            </div>
          </div>
        </div>

        <!-- What The AI Coach Is Doing (Engine Architecture & Features) -->
        <div class="bg-slate-900/90 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-mono uppercase text-emerald-400 font-bold flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              What The AI Coach Does
            </span>
            <span id="coach-ai-model-tag" class="text-[9px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">DeepKinematics-v3</span>
          </div>
          <p class="text-[11px] text-slate-300 leading-relaxed">
            The coach analyzes continuous 60Hz thumbstick kinematics—not just shots fired:
          </p>
          <ul id="coach-ai-features-list" class="text-[11px] text-slate-400 space-y-1 list-disc pl-4 font-mono">
            <li>Polar Velocity Profiling: tracks acceleration curves & brake timing on flicks.</li>
            <li>Stick Saturation: measures time spent pinned against the outer deadzone.</li>
            <li>Tremor & Jitter Index: detects micro-oscillations near target perimeters.</li>
            <li>Headshot Arc Efficiency: compares direct center vectors vs overshoot arcs.</li>
          </ul>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-mono uppercase text-slate-400 font-bold block">Target Acquisition Insights</span>
          <div id="coach-insights-container" class="space-y-2"></div>
        </div>

        <div class="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <span class="text-[11px] font-mono uppercase text-cyan-400 font-bold block">Recommended Training Drills</span>
          <ul id="coach-drills-list" class="text-xs text-slate-300 space-y-1.5 list-disc pl-4"></ul>
        </div>

        <button id="btn-coach-start-drill" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs tracking-wider shadow-lg shadow-emerald-500/25 transition-all">
          RESUME TARGET PRACTICE
        </button>
      </div>
    </div>

    <!-- Auto-Tune Results Modal -->
    <div id="autotune-result-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div class="glass-panel border border-cyan-500/40 p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-4 glow-blue">
        <div class="flex items-center justify-between border-b border-slate-800 pb-3">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">✓</div>
            <h3 class="font-heading text-lg font-bold text-white">SENSITIVITY AUTO-FIX APPLIED</h3>
          </div>
          <button id="btn-close-modal" class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center text-xs font-mono">
          <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span class="text-slate-400 text-[10px] block">OVERSHOOTS</span>
            <span id="modal-overshoots" class="font-bold text-rose-400 text-sm">0</span>
          </div>
          <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span class="text-slate-400 text-[10px] block">UNDERSHOOTS</span>
            <span id="modal-undershoots" class="font-bold text-amber-400 text-sm">0</span>
          </div>
          <div class="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span class="text-slate-400 text-[10px] block">JITTER REVERSALS</span>
            <span id="modal-jitters" class="font-bold text-cyan-400 text-sm">0</span>
          </div>
        </div>

        <div class="bg-slate-900/60 rounded-xl p-3 border border-slate-800 text-xs">
          <table class="w-full">
            <thead>
              <tr class="text-slate-400 text-[10px] font-mono border-b border-slate-800 pb-1">
                <th class="text-left pb-1">PARAMETER</th>
                <th class="text-center pb-1">BEFORE</th>
                <th class="text-center pb-1 text-emerald-400 font-bold">OPTIMIZED</th>
              </tr>
            </thead>
            <tbody id="modal-diff-body" class="font-mono divide-y divide-slate-800/50"></tbody>
          </table>
        </div>

        <div class="space-y-1.5 bg-slate-900/80 p-3 rounded-xl border border-slate-800/80">
          <span class="text-[10px] font-mono uppercase text-slate-400 block font-bold">Telemetry Diagnosis</span>
          <ul id="modal-diagnosis-list" class="text-xs text-slate-300 space-y-1 list-disc pl-4"></ul>
        </div>

        <button id="btn-modal-done" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs tracking-wider shadow-lg shadow-emerald-500/20 transition-all">
          ACCEPT & TEST ON FIRING RANGE
        </button>
      </div>
    </div>

    <!-- Connect Controller Banner -->
    <div id="no-controller-banner" class="absolute top-20 left-6 z-20 max-w-xs glass-panel p-3.5 rounded-xl border border-amber-500/30 text-xs text-amber-200/90 space-y-1.5 shadow-2xl transition-opacity">
      <div class="flex items-center gap-2 font-bold text-amber-400">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Gamepad Standby
      </div>
      <p class="text-slate-300 text-[11px] leading-relaxed">
        Plug in or pair your Xbox/PlayStation controller and <strong>press any button</strong> to activate. Or click the screen to test with mouse!
      </p>
    </div>

  </div>
`;

// Initialize 3D Target Range & AutoTuner Engine
const canvasContainer = document.getElementById('canvas-container');
range = new TargetRange(canvasContainer, engine);
autoTuner = new AutoTunerEngine(engine, range);

// Hook Range shot events into AutoTuner
range.onShotAttempt = (shotData) => {
  autoTuner.recordShotEvent(shotData);
};

// When range finishes a session, trigger AI coach report automatically
range.onSessionFinish = (stats) => {
  openCoachModal(stats);
};

// Connect Range Stats callback
range.onStatsUpdate = (stats) => {
  document.getElementById('hud-score').textContent = stats.score;
  document.getElementById('hud-accuracy').textContent = `${stats.accuracy}%`;
  document.getElementById('hud-reaction').textContent = `${stats.avgReaction}ms`;
  document.getElementById('hud-timer').textContent = `${stats.timeLeft}s`;
};

// AutoTuner UI Callbacks
const autotuneBanner = document.getElementById('autotune-banner');
const autotuneInstruction = document.getElementById('autotune-instruction');
const autotuneProgressBar = document.getElementById('autotune-progress-bar');
const autoTuneWandIcon = document.getElementById('auto-tune-wand-icon');
const autoTuneSpinIcon = document.getElementById('auto-tune-spin-icon');
const btnAutoTuneText = document.getElementById('btn-auto-tune-text');

autoTuner.onProgressUpdate = ({ step, targetNumber, totalTargets, message, progress }) => {
  autotuneBanner.classList.remove('hidden');
  autotuneInstruction.textContent = message;
  autotuneProgressBar.style.width = `${progress}%`;
};

autoTuner.onAutoTuneComplete = (result) => {
  autotuneBanner.classList.add('hidden');
  autoTuneSpinIcon.style.display = 'none';
  autoTuneWandIcon.style.display = 'inline-block';
  btnAutoTuneText.textContent = 'AUTO-FIX';

  confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });

  syncSettingsToUI();
  renderCurveSVG();

  document.getElementById('modal-overshoots').textContent = result.stats.overshoots;
  document.getElementById('modal-undershoots').textContent = result.stats.undershoots;
  document.getElementById('modal-jitters').textContent = result.stats.jitters;

  const diffBody = document.getElementById('modal-diff-body');
  diffBody.innerHTML = `
    <tr>
      <td class="py-1 text-slate-300">Look Sens X / Y</td>
      <td class="text-center text-slate-400">${result.before.lookSensX} / ${result.before.lookSensY}</td>
      <td class="text-center text-emerald-400 font-bold">${result.after.lookSensX} / ${result.after.lookSensY}</td>
    </tr>
    <tr>
      <td class="py-1 text-slate-300">Inner Deadzone</td>
      <td class="text-center text-slate-400">${Math.round(result.before.innerDeadzone * 100)}%</td>
      <td class="text-center text-emerald-400 font-bold">${Math.round(result.after.innerDeadzone * 100)}%</td>
    </tr>
    <tr>
      <td class="py-1 text-slate-300">Response Curve</td>
      <td class="text-center text-slate-400 uppercase">${result.before.curveType}</td>
      <td class="text-center text-emerald-400 font-bold uppercase">${result.after.curveType}</td>
    </tr>
    <tr>
      <td class="py-1 text-slate-300">Aim Smoothing</td>
      <td class="text-center text-slate-400">${result.before.smoothingFactor}</td>
      <td class="text-center text-emerald-400 font-bold">${result.after.smoothingFactor}</td>
    </tr>
  `;

  const diagList = document.getElementById('modal-diagnosis-list');
  diagList.innerHTML = result.diagnosis.map((d) => `<li>${d}</li>`).join('');

  document.getElementById('autotune-result-modal').classList.remove('hidden');
};

// Open AI Coach Modal
function openCoachModal(stats = null) {
  const currentStats = stats || range.getStatsSnapshot();
  const report = coach.generateCoachingReport(currentStats, autoTuner.targetHistory);

  const gradeBadge = document.getElementById('coach-grade-badge');
  gradeBadge.textContent = report.grade;
  gradeBadge.className = `text-xs px-2 py-0.5 rounded border font-mono ${report.badgeColor}`;

  document.getElementById('coach-verdict-text').textContent = report.verdict;
  document.getElementById('coach-stat-acc').textContent = report.accuracy;
  document.getElementById('coach-stat-react').textContent = report.avgReaction;
  document.getElementById('coach-stat-hs').textContent = report.headshotRate;
  document.getElementById('coach-stat-streak').textContent = report.streak;

  // Kinematic movement metrics
  if (report.kinematics) {
    const smEl = document.getElementById('coach-kin-smoothness');
    if (smEl) smEl.textContent = `${report.kinematics.smoothnessScore}%`;
    const effEl = document.getElementById('coach-kin-efficiency');
    if (effEl) effEl.textContent = `${report.kinematics.pathEfficiency}%`;
    const pegEl = document.getElementById('coach-kin-pegging');
    if (pegEl) pegEl.textContent = `${report.kinematics.stickPeggingPct}%`;
  }

  const insightsContainer = document.getElementById('coach-insights-container');
  insightsContainer.innerHTML = report.insights.map((ins) => `
    <div class="p-3 rounded-xl border ${ins.type === 'positive' ? 'bg-emerald-950/30 border-emerald-500/30' : ins.type === 'warning' ? 'bg-amber-950/30 border-amber-500/30' : 'bg-blue-950/30 border-blue-500/30'}">
      <span class="text-xs font-bold text-white block mb-0.5">${ins.title}</span>
      <p class="text-xs text-slate-300 leading-relaxed">${ins.detail}</p>
    </div>
  `).join('');

  const drillsList = document.getElementById('coach-drills-list');
  drillsList.innerHTML = report.trainingDrills.map((drill) => `<li>${drill}</li>`).join('');

  document.getElementById('coach-modal').classList.remove('hidden');
}

// Live AI Coach HUD feedback & onTargetHit trigger
const coachLiveBanner = document.getElementById('coach-live-banner');
const coachLiveTip = document.getElementById('coach-live-tip');
let coachBannerTimeout = null;

// Hook Target Hit in NORMAL modes: clicking/shooting any target starts AI coach evaluation without blocking gameplay!
range.onTargetHit = (hitEvent) => {
  // Only trigger AI coach on normal practice mode, NEVER on auto-fix/calibration mode
  if (autoTuner.isCalibrating || range.mode === 'single_calibration') {
    return;
  }

  // Continuously analyze performance
  const report = coach.generateCoachingReport(hitEvent.stats, autoTuner.targetHistory);

  // Update non-blocking Live Coach Banner on the HUD so user can keep shooting smoothly
  if (coachLiveBanner && coachLiveTip) {
    coachLiveBanner.classList.remove('hidden');
    const primaryInsight = report.insights && report.insights.length > 0 ? report.insights[0] : null;
    if (primaryInsight) {
      coachLiveTip.textContent = `${primaryInsight.title}: ${primaryInsight.detail.slice(0, 95)}...`;
    } else {
      coachLiveTip.textContent = `Grade: ${report.grade} | Reaction: ${report.avgReaction} | Accuracy: ${report.accuracy}`;
    }

    // Auto fade banner after 4.5s of no hits
    if (coachBannerTimeout) clearTimeout(coachBannerTimeout);
    coachBannerTimeout = setTimeout(() => {
      coachLiveBanner.classList.add('hidden');
    }, 4500);
  }
};


// Render Curve Graph
function renderCurveSVG() {
  const points = engine.generateCurvePoints(50);
  const polyline = document.getElementById('curve-path');
  const deadzoneRect = document.getElementById('curve-deadzone-rect');
  
  if (polyline) {
    const coords = points.map((p) => {
      const svgX = p.input * 100;
      const svgY = 100 - p.output * 100;
      return `${svgX.toFixed(1)},${svgY.toFixed(1)}`;
    }).join(' ');
    polyline.setAttribute('points', coords);
  }

  if (deadzoneRect) {
    const dzWidth = engine.settings.innerDeadzone * 100;
    deadzoneRect.setAttribute('width', dzWidth.toString());
  }

  const radarDz = document.getElementById('radar-deadzone-ring');
  if (radarDz) {
    const pct = Math.round(engine.settings.innerDeadzone * 200);
    radarDz.style.width = `${pct}%`;
    radarDz.style.height = `${pct}%`;
  }
}

// Control Listeners
function setupControlListeners() {
  // Coach Open/Close
  document.getElementById('btn-open-coach').addEventListener('click', () => openCoachModal());
  const coachLiveViewBtn = document.getElementById('coach-live-view-btn');
  if (coachLiveViewBtn) {
    coachLiveViewBtn.addEventListener('click', () => openCoachModal());
  }
  document.getElementById('btn-close-coach').addEventListener('click', () => {
    document.getElementById('coach-modal').classList.add('hidden');
  });
  document.getElementById('btn-coach-start-drill').addEventListener('click', () => {
    document.getElementById('coach-modal').classList.add('hidden');
    range.startSession('spidershot', 45);
  });

  // Auto-Tune Trigger
  const btnAutoTune = document.getElementById('btn-auto-tune');
  btnAutoTune.addEventListener('click', () => {
    if (autoTuner.isCalibrating) {
      autoTuner.stopCalibration();
      autotuneBanner.classList.add('hidden');
      autoTuneSpinIcon.style.display = 'none';
      autoTuneWandIcon.style.display = 'inline-block';
      btnAutoTuneText.textContent = 'AUTO-FIX';
    } else {
      autoTuneSpinIcon.style.display = 'inline-block';
      autoTuneWandIcon.style.display = 'none';
      btnAutoTuneText.textContent = 'CALIBRATING...';
      autoTuner.startCalibration();
    }
  });

  document.getElementById('btn-cancel-autotune').addEventListener('click', () => {
    autoTuner.stopCalibration();
    autotuneBanner.classList.add('hidden');
    autoTuneSpinIcon.style.display = 'none';
    autoTuneWandIcon.style.display = 'inline-block';
    btnAutoTuneText.textContent = 'AUTO-FIX';
  });

  // Modals Close
  const modal = document.getElementById('autotune-result-modal');
  document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('btn-modal-done').addEventListener('click', () => {
    modal.classList.add('hidden');
    range.startSession('gridshot', 45);
  });

  // Drawer Toggle
  const drawer = document.getElementById('tuning-drawer');
  const btnToggle = document.getElementById('btn-toggle-settings');
  const btnCloseDrawer = document.getElementById('btn-close-drawer');

  btnToggle.addEventListener('click', () => drawer.classList.toggle('translate-x-full'));
  btnCloseDrawer.addEventListener('click', () => drawer.classList.add('translate-x-full'));

  // Drawer Tabs: Tuner, Target Studio, Radar
  const tabTuner = document.getElementById('tab-tuner');
  const tabTarget = document.getElementById('tab-target');
  const tabMonitor = document.getElementById('tab-monitor');
  const pageTuner = document.getElementById('page-tuner');
  const pageTarget = document.getElementById('page-target');
  const pageMonitor = document.getElementById('page-monitor');

  function setTab(activeTab, activePage) {
    [tabTuner, tabTarget, tabMonitor].forEach((t) => {
      t.className = 'flex-1 py-2.5 border-b-2 border-transparent text-slate-400 hover:text-slate-200';
    });
    [pageTuner, pageTarget, pageMonitor].forEach((p) => p.classList.add('hidden'));

    activeTab.className = 'flex-1 py-2.5 border-b-2 border-cyan-400 text-cyan-400 bg-slate-800/40';
    activePage.classList.remove('hidden');
  }

  tabTuner.addEventListener('click', () => setTab(tabTuner, pageTuner));
  tabTarget.addEventListener('click', () => setTab(tabTarget, pageTarget));
  tabMonitor.addEventListener('click', () => setTab(tabMonitor, pageMonitor));

  /** @param {string} id @returns {HTMLInputElement} */
  const getInput = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
  /** @param {string} id @returns {HTMLSelectElement} */
  const getSelect = (id) => /** @type {HTMLSelectElement} */ (document.getElementById(id));

  // TARGET CUSTOMIZER CONTROLS
  // 0. Object Tracking Follower Speed & Agility
  const sliderTrackingSpeed = getInput('slider-tracking-speed');
  sliderTrackingSpeed.addEventListener('input', () => {
    const val = parseFloat(sliderTrackingSpeed.value);
    range.targetConfig.trackingSpeed = val;
    document.getElementById('val-tracking-speed').textContent = `${val.toFixed(1)} m/s`;
    range.saveTargetConfig();
    if (range.mode === 'tracking') {
      range.targets.forEach((t) => { if (t.isMoving) t.currentSpeed = val; });
    }
  });

  const sliderTrackingAgility = getInput('slider-tracking-agility');
  sliderTrackingAgility.addEventListener('input', () => {
    const val = parseFloat(sliderTrackingAgility.value);
    range.targetConfig.trackingAgility = val;
    document.getElementById('val-tracking-agility').textContent = `${val.toFixed(1)}x (${val > 2.5 ? 'Chaos' : val > 1.5 ? 'Erratic' : 'Smooth'})`;
    range.saveTargetConfig();
  });

  document.querySelectorAll('.btn-tracking-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const spd = parseFloat(btn.getAttribute('data-speed'));
      const agi = parseFloat(btn.getAttribute('data-agility'));
      range.targetConfig.trackingSpeed = spd;
      range.targetConfig.trackingAgility = agi;
      sliderTrackingSpeed.value = spd.toString();
      sliderTrackingAgility.value = agi.toString();
      document.getElementById('val-tracking-speed').textContent = `${spd.toFixed(1)} m/s`;
      document.getElementById('val-tracking-agility').textContent = `${agi.toFixed(1)}x`;
      range.saveTargetConfig();
      if (range.mode === 'tracking') {
        range.spawnTrackingTarget();
      }
    });
  });

  // 1. Spacing & Spread
  const sliderTargetSpread = getInput('slider-target-spread');
  sliderTargetSpread.addEventListener('input', () => {
    const val = parseFloat(sliderTargetSpread.value);
    range.targetConfig.spreadScale = val;
    document.getElementById('val-target-spread').textContent = `${val.toFixed(1)}x`;
    range.saveTargetConfig();
    range.spawnGridshotTargets();
  });

  const sliderTargetSep = getInput('slider-target-sep');
  sliderTargetSep.addEventListener('input', () => {
    const val = parseFloat(sliderTargetSep.value);
    range.targetConfig.minSeparation = val;
    document.getElementById('val-target-sep').textContent = `${val.toFixed(1)}m`;
    range.saveTargetConfig();
    range.spawnGridshotTargets();
  });

  // 2. Size Scale
  const sliderTargetSize = getInput('slider-target-size');
  sliderTargetSize.addEventListener('input', () => {
    const val = parseFloat(sliderTargetSize.value);
    range.targetConfig.sizeScale = val;
    document.getElementById('val-target-size').textContent = `${val.toFixed(1)}x`;
    range.saveTargetConfig();
  });


  document.querySelectorAll('.btn-quick-size').forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = parseFloat(btn.getAttribute('data-size'));
      range.targetConfig.sizeScale = size;
      sliderTargetSize.value = size.toString();
      document.getElementById('val-target-size').textContent = `${size.toFixed(1)}x`;
      range.saveTargetConfig();
      range.spawnGridshotTargets();
    });
  });

  // 3. Shape
  document.querySelectorAll('.target-shape-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const shape = btn.getAttribute('data-shape');
      range.targetConfig.shape = shape;
      document.querySelectorAll('.target-shape-btn').forEach((b) => {
        b.className = 'target-shape-btn py-2 px-1 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-900 text-slate-400 hover:border-cyan-400';
      });
      btn.className = 'target-shape-btn py-2 px-1 rounded-xl text-xs font-semibold border border-cyan-400 bg-slate-800 text-cyan-300';
      range.saveTargetConfig();
      range.spawnGridshotTargets();
    });
  });

  // 4. Colors
  const colorPrimary = getInput('color-target-primary');
  colorPrimary.addEventListener('input', () => {
    range.targetConfig.primaryColor = colorPrimary.value;
    document.getElementById('lbl-target-primary').textContent = colorPrimary.value;
    document.getElementById('reticle-dot').style.backgroundColor = colorPrimary.value;
    range.saveTargetConfig();
    range.spawnGridshotTargets();
  });

  const colorCore = getInput('color-target-core');
  colorCore.addEventListener('input', () => {
    range.targetConfig.coreColor = colorCore.value;
    document.getElementById('lbl-target-core').textContent = colorCore.value;
    range.saveTargetConfig();
    range.spawnGridshotTargets();
  });

  document.querySelectorAll('.btn-theme-preset').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      if (theme === 'cyber_cyan') {
        range.targetConfig.primaryColor = '#06b6d4';
        range.targetConfig.coreColor = '#f43f5e';
      } else if (theme === 'emerald_lime') {
        range.targetConfig.primaryColor = '#10b981';
        range.targetConfig.coreColor = '#eab308';
      } else if (theme === 'amber_solar') {
        range.targetConfig.primaryColor = '#f59e0b';
        range.targetConfig.coreColor = '#ef4444';
      } else if (theme === 'violet_synth') {
        range.targetConfig.primaryColor = '#a855f7';
        range.targetConfig.coreColor = '#06b6d4';
      }
      colorPrimary.value = range.targetConfig.primaryColor;
      colorCore.value = range.targetConfig.coreColor;
      document.getElementById('lbl-target-primary').textContent = range.targetConfig.primaryColor;
      document.getElementById('lbl-target-core').textContent = range.targetConfig.coreColor;
      document.getElementById('reticle-dot').style.backgroundColor = range.targetConfig.primaryColor;
      range.saveTargetConfig();
      range.spawnGridshotTargets();
    });
  });

  // 5. Glow
  const sliderGlow = getInput('slider-target-glow');
  sliderGlow.addEventListener('input', () => {
    const val = parseFloat(sliderGlow.value);
    range.targetConfig.glowIntensity = val;
    document.getElementById('val-target-glow').textContent = `${Math.round(val * 100)}%`;
    range.saveTargetConfig();
  });

  document.getElementById('btn-apply-target-custom').addEventListener('click', () => {
    range.saveTargetConfig();
    range.spawnGridshotTargets();
    sound.playSpawn();
  });

  // Sensitivity Tuner Sliders
  const presetSelector = getSelect('preset-selector');
  presetSelector.addEventListener('change', () => {
    engine.applyPreset(presetSelector.value);
    syncSettingsToUI();
    renderCurveSVG();
  });

  const sliderSensX = getInput('slider-sens-x');
  sliderSensX.addEventListener('input', () => {
    const val = parseFloat(sliderSensX.value);
    engine.settings.lookSensX = val;
    document.getElementById('val-sens-x').textContent = val.toFixed(1);
    engine.saveSettings();
  });

  const sliderSensY = getInput('slider-sens-y');
  sliderSensY.addEventListener('input', () => {
    const val = parseFloat(sliderSensY.value);
    engine.settings.lookSensY = val;
    document.getElementById('val-sens-y').textContent = val.toFixed(1);
    engine.saveSettings();
  });

  const sliderAds = getInput('slider-ads-mult');
  sliderAds.addEventListener('input', () => {
    const val = parseFloat(sliderAds.value);
    engine.settings.adsMultiplier = val;
    document.getElementById('val-ads-mult').textContent = `${val.toFixed(2)}x`;
    engine.saveSettings();
  });

  const sliderExp = getInput('slider-curve-exp');
  sliderExp.addEventListener('input', () => {
    const val = parseFloat(sliderExp.value);
    engine.settings.curveExponent = val;
    document.getElementById('val-curve-exp').textContent = val.toFixed(2);
    engine.saveSettings();
    renderCurveSVG();
  });

  const sliderInnerDz = getInput('slider-inner-dz');
  sliderInnerDz.addEventListener('input', () => {
    const val = parseFloat(sliderInnerDz.value);
    engine.settings.innerDeadzone = val;
    document.getElementById('val-inner-dz').textContent = `${Math.round(val * 100)}%`;
    engine.saveSettings();
    renderCurveSVG();
  });

  const sliderOuterDz = getInput('slider-outer-dz');
  sliderOuterDz.addEventListener('input', () => {
    const val = parseFloat(sliderOuterDz.value);
    engine.settings.outerThreshold = val;
    document.getElementById('val-outer-dz').textContent = `${Math.round(val * 100)}%`;
    engine.saveSettings();
    renderCurveSVG();
  });

  const checkInvertY = getInput('check-invert-y');
  checkInvertY.addEventListener('change', () => {
    engine.settings.invertY = checkInvertY.checked;
    engine.saveSettings();
  });
  const checkInvertX = getInput('check-invert-x');
  checkInvertX.addEventListener('change', () => {
    engine.settings.invertX = checkInvertX.checked;
    engine.saveSettings();
  });

  const sliderSmooth = getInput('slider-smooth');
  sliderSmooth.addEventListener('input', () => {
    const val = parseFloat(sliderSmooth.value);
    engine.settings.smoothingFactor = val;
    document.getElementById('val-smooth').textContent = val.toFixed(2);
    engine.saveSettings();
  });

  const checkOverFlick = getInput('check-overflick-vibe');
  checkOverFlick.addEventListener('change', () => {
    engine.settings.overFlickVibration = checkOverFlick.checked;
    engine.saveSettings();
  });

  const sliderOverFlickIntensity = getInput('slider-overflick-intensity');
  sliderOverFlickIntensity.addEventListener('input', () => {
    const val = parseFloat(sliderOverFlickIntensity.value);
    engine.settings.overFlickIntensity = val;
    const pct = Math.round(val * 100);
    document.getElementById('val-overflick-intensity').textContent = pct >= 100 ? '100% (MAX)' : `${pct}%`;
    engine.saveSettings();
    engine.playVibration(160, val, val);
  });

  document.querySelectorAll('.curve-select-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const curve = btn.getAttribute('data-curve');
      engine.settings.curveType = curve;
      document.querySelectorAll('.curve-select-btn').forEach((b) => {
        b.classList.remove('bg-slate-800', 'text-slate-200');
        b.classList.add('bg-slate-900', 'text-slate-400');
      });
      btn.classList.add('bg-slate-800', 'text-slate-200');
      document.getElementById('curve-badge').textContent = curve.toUpperCase();
      engine.saveSettings();
      renderCurveSVG();
    });
  });

  // Practice Modes
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode');
      document.querySelectorAll('.mode-btn').forEach((b) => {
        b.classList.remove('bg-cyan-500', 'text-slate-950', 'shadow-md');
        b.classList.add('text-slate-300', 'hover:bg-slate-800');
      });
      btn.classList.add('bg-cyan-500', 'text-slate-950', 'shadow-md');
      btn.classList.remove('text-slate-300', 'hover:bg-slate-800');
      range.startSession(mode, mode === 'free_calibrate' ? 99999 : 45);
    });
  });

  document.getElementById('btn-start-session').addEventListener('click', () => {
    const activeModeBtn = document.querySelector('.mode-btn.bg-cyan-500');
    const mode = activeModeBtn ? activeModeBtn.getAttribute('data-mode') : 'gridshot';
    range.startSession(mode, mode === 'free_calibrate' ? 99999 : 45);
  });

  document.getElementById('btn-test-rumble').addEventListener('click', () => {
    engine.playVibration(250, 0.8, 0.5);
  });

  document.getElementById('btn-toggle-sound').addEventListener('click', () => {
    sound.enabled = !sound.enabled;
    const btn = document.getElementById('btn-toggle-sound');
    btn.classList.toggle('text-slate-500', !sound.enabled);
    btn.classList.toggle('text-slate-300', sound.enabled);
  });
}

function syncSettingsToUI() {
  /** @param {string} id @returns {HTMLInputElement} */
  const getInput = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));

  const s = engine.settings;
  getInput('slider-sens-x').value = s.lookSensX.toString();
  document.getElementById('val-sens-x').textContent = s.lookSensX.toFixed(1);

  getInput('slider-sens-y').value = s.lookSensY.toString();
  document.getElementById('val-sens-y').textContent = s.lookSensY.toFixed(1);

  getInput('slider-ads-mult').value = s.adsMultiplier.toString();
  document.getElementById('val-ads-mult').textContent = `${s.adsMultiplier.toFixed(2)}x`;

  getInput('slider-curve-exp').value = s.curveExponent.toString();
  document.getElementById('val-curve-exp').textContent = s.curveExponent.toFixed(2);

  getInput('slider-inner-dz').value = s.innerDeadzone.toString();
  document.getElementById('val-inner-dz').textContent = `${Math.round(s.innerDeadzone * 100)}%`;

  getInput('slider-outer-dz').value = s.outerThreshold.toString();
  document.getElementById('val-outer-dz').textContent = `${Math.round(s.outerThreshold * 100)}%`;

  getInput('slider-smooth').value = s.smoothingFactor.toString();
  document.getElementById('val-smooth').textContent = s.smoothingFactor.toFixed(2);

  getInput('check-invert-y').checked = !!s.invertY;
  getInput('check-invert-x').checked = !!s.invertX;

  if (document.getElementById('check-overflick-vibe')) {
    getInput('check-overflick-vibe').checked = s.overFlickVibration !== false;
  }
  if (document.getElementById('slider-overflick-intensity')) {
    const intVal = s.overFlickIntensity !== undefined ? s.overFlickIntensity : 1.0;
    getInput('slider-overflick-intensity').value = intVal.toString();
    const pct = Math.round(intVal * 100);
    document.getElementById('val-overflick-intensity').textContent = pct >= 100 ? '100% (MAX)' : `${pct}%`;
  }

  document.getElementById('curve-badge').textContent = s.curveType.toUpperCase();

  // Sync Target Customizer UI
  const tc = range.targetConfig;
  if (tc) {
    if (document.getElementById('slider-tracking-speed')) {
      getInput('slider-tracking-speed').value = (tc.trackingSpeed || 4.5).toString();
      document.getElementById('val-tracking-speed').textContent = `${(tc.trackingSpeed || 4.5).toFixed(1)} m/s`;
    }
    if (document.getElementById('slider-tracking-agility')) {
      getInput('slider-tracking-agility').value = (tc.trackingAgility || 1.8).toString();
      document.getElementById('val-tracking-agility').textContent = `${(tc.trackingAgility || 1.8).toFixed(1)}x`;
    }
    if (document.getElementById('slider-target-spread')) {
      getInput('slider-target-spread').value = (tc.spreadScale || 1.2).toString();
      document.getElementById('val-target-spread').textContent = `${(tc.spreadScale || 1.2).toFixed(1)}x`;
    }
    if (document.getElementById('slider-target-sep')) {
      getInput('slider-target-sep').value = (tc.minSeparation || 2.2).toString();
      document.getElementById('val-target-sep').textContent = `${(tc.minSeparation || 2.2).toFixed(1)}m`;
    }
    getInput('slider-target-size').value = (tc.sizeScale || 1.0).toString();
    document.getElementById('val-target-size').textContent = `${(tc.sizeScale || 1.0).toFixed(1)}x`;

    getInput('color-target-primary').value = tc.primaryColor || '#06b6d4';
    document.getElementById('lbl-target-primary').textContent = tc.primaryColor || '#06b6d4';

    getInput('color-target-core').value = tc.coreColor || '#f43f5e';
    document.getElementById('lbl-target-core').textContent = tc.coreColor || '#f43f5e';

    getInput('slider-target-glow').value = (tc.glowIntensity || 0.8).toString();
    document.getElementById('val-target-glow').textContent = `${Math.round((tc.glowIntensity || 0.8) * 100)}%`;

    document.getElementById('reticle-dot').style.backgroundColor = tc.primaryColor || '#06b6d4';

    document.querySelectorAll('.target-shape-btn').forEach((b) => {
      if (b.getAttribute('data-shape') === tc.shape) {
        b.className = 'target-shape-btn py-2 px-1 rounded-xl text-xs font-semibold border border-cyan-400 bg-slate-800 text-cyan-300';
      } else {
        b.className = 'target-shape-btn py-2 px-1 rounded-xl text-xs font-semibold border border-slate-700 bg-slate-900 text-slate-400 hover:border-cyan-400';
      }
    });
  }
}

// Animation Loop
let lastTime = performance.now();

function mainLoop(now) {
  const deltaSec = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const poll = engine.poll();

  const dot = document.getElementById('controller-dot');
  const name = document.getElementById('controller-name');
  const noPadBanner = document.getElementById('no-controller-banner');

  if (poll.connected) {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]';
    name.textContent = poll.name.length > 20 ? poll.name.slice(0, 20) + '...' : poll.name;
    if (noPadBanner) noPadBanner.classList.add('opacity-0', 'pointer-events-none');
  } else {
    dot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse';
    name.textContent = 'No Controller Detected';
    if (noPadBanner) noPadBanner.classList.remove('opacity-0', 'pointer-events-none');
  }

  const rawX = poll.rawRightStick.x;
  const rawY = poll.rawRightStick.y;
  const rawMag = Math.hypot(rawX, rawY);

  const curveDot = document.getElementById('curve-live-dot');
  if (curveDot && poll.aimOutput) {
    const clampedIn = Math.min(1.0, rawMag);
    const svgX = clampedIn * 100;
    const svgY = 100 - (poll.aimOutput.processedMag || 0) * 100;
    curveDot.setAttribute('cx', svgX.toFixed(1));
    curveDot.setAttribute('cy', svgY.toFixed(1));
  }

  const radarStickDot = document.getElementById('radar-stick-dot');
  if (radarStickDot) {
    const pctX = 50 + (rawX * 45);
    const pctY = 50 + (rawY * 45);
    radarStickDot.style.left = `${pctX}%`;
    radarStickDot.style.top = `${pctY}%`;

    const rawPosEl = document.getElementById('telemetry-raw-pos');
    if (rawPosEl) rawPosEl.textContent = `${rawX.toFixed(2)}, ${rawY.toFixed(2)}`;

    const outMagEl = document.getElementById('telemetry-out-mag');
    if (outMagEl) outMagEl.textContent = (poll.aimOutput?.processedMag || 0).toFixed(2);

    // Visual ring pulse feedback when hitting the outer stick limit
    const radarOuterRing = document.getElementById('radar-outer-ring');
    if (radarOuterRing) {
      if (poll.aimOutput?.isPegged) {
        radarOuterRing.className = 'absolute rounded-full border-2 border-rose-500 shadow-[0_0_12px_#f43f5e] animate-pulse';
      } else {
        radarOuterRing.className = 'absolute rounded-full border border-emerald-500/50';
      }
    }
  }

  // Stream continuous movement telemetry into the AI Aim Coach
  coach.recordMovementSample({
    time: now,
    rawX,
    rawY,
    rawMag,
    processedX: poll.aimOutput?.x || 0,
    processedY: poll.aimOutput?.y || 0,
    processedMag: poll.aimOutput?.processedMag || 0,
    isShooting: poll.isShoot || false,
    yaw: range.yaw,
    pitch: range.pitch,
  });

  // Handle all gamepad-driven actions (100% controller playable)
  handleGamepadShortcuts(poll);

  autoTuner.update(deltaSec);
  range.update(deltaSec);

  requestAnimationFrame(mainLoop);
}

// Controller Actions State Machine
const lastButtons = {
  a: false,
  b: false,
  x: false,
  y: false,
  lb: false,
  rb: false,
  start: false,
  select: false,
  dpadUp: false,
  dpadDown: false,
  dpadLeft: false,
  dpadRight: false,
};

const MODES_LIST = ['gridshot', 'tracking', 'spidershot', 'free_calibrate'];
const PRESETS_LIST = [
  'call_of_duty_dynamic',
  'apex_legends_linear',
  'halo_exponential',
  'fortnite_exponential',
  'precision_flick',
  'default',
];

function selectMode(mode) {
  document.querySelectorAll('.mode-btn').forEach((b) => {
    if (b.getAttribute('data-mode') === mode) {
      b.className = 'mode-btn px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all bg-cyan-500 text-slate-950 shadow-md';
    } else {
      b.className = 'mode-btn px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all text-slate-300 hover:text-white hover:bg-slate-800';
    }
  });
  range.startSession(mode, mode === 'free_calibrate' ? 99999 : 45);
}

function handleGamepadShortcuts(poll) {
  if (!poll.connected || !poll.buttons) return;
  const b = poll.buttons;

  // Edge triggers (just pressed)
  const pressed = (key) => b[key] && !lastButtons[key];

  const drawer = document.getElementById('tuning-drawer');
  const coachModal = document.getElementById('coach-modal');
  const autotuneModal = document.getElementById('autotune-result-modal');

  const isCoachOpen = !coachModal.classList.contains('hidden');
  const isAutoTuneModalOpen = !autotuneModal.classList.contains('hidden');
  const isDrawerOpen = !drawer.classList.contains('translate-x-full');

  // 1. A / Cross: Start Session / Confirm modal / Drill resume
  if (pressed('a')) {
    if (isAutoTuneModalOpen) {
      autotuneModal.classList.add('hidden');
      range.startSession('gridshot', 45);
    } else if (isCoachOpen) {
      coachModal.classList.add('hidden');
      range.startSession('spidershot', 45);
    } else if (isDrawerOpen) {
      // Toggle tabs inside drawer on A if drawer is open
      const tabTuner = document.getElementById('tab-tuner');
      const tabTarget = document.getElementById('tab-target');
      const tabMonitor = document.getElementById('tab-monitor');
      const pageTuner = document.getElementById('page-tuner');
      const pageTarget = document.getElementById('page-target');
      const pageMonitor = document.getElementById('page-monitor');
      if (pageTuner.classList.contains('hidden')) {
        tabTuner.click();
      } else {
        tabTarget.click();
      }
    } else {
      // Start or Restart current session
      const activeModeBtn = document.querySelector('.mode-btn.bg-cyan-500');
      const mode = activeModeBtn ? activeModeBtn.getAttribute('data-mode') : 'gridshot';
      range.startSession(mode, mode === 'free_calibrate' ? 99999 : 45);
    }
  }

  // 2. B / Circle: Close Modals / Close Drawer / Cancel Auto-Fix
  if (pressed('b')) {
    if (isCoachOpen) {
      coachModal.classList.add('hidden');
    } else if (isAutoTuneModalOpen) {
      autotuneModal.classList.add('hidden');
    } else if (isDrawerOpen) {
      drawer.classList.add('translate-x-full');
    } else if (autoTuner.isCalibrating) {
      document.getElementById('btn-cancel-autotune').click();
    }
  }

  // 3. X / Square: Trigger / Cancel Sensitivity Auto-Fix
  if (pressed('x')) {
    document.getElementById('btn-auto-tune').click();
  }

  // 4. Y / Triangle: Toggle AI Coach Modal
  if (pressed('y')) {
    if (isCoachOpen) {
      coachModal.classList.add('hidden');
    } else {
      openCoachModal();
    }
  }

  // 5. START / Options / Menu: Toggle Studio Drawer
  if (pressed('start')) {
    drawer.classList.toggle('translate-x-full');
  }

  // 6. SELECT / Back / Share: Toggle Sound FX
  if (pressed('select') || pressed('back')) {
    document.getElementById('btn-toggle-sound').click();
  }

  // 7. LB (Previous Mode) & RB (Next Mode)
  if (pressed('lb')) {
    const activeModeBtn = document.querySelector('.mode-btn.bg-cyan-500');
    const currentMode = activeModeBtn ? activeModeBtn.getAttribute('data-mode') : 'gridshot';
    let idx = MODES_LIST.indexOf(currentMode);
    idx = (idx - 1 + MODES_LIST.length) % MODES_LIST.length;
    selectMode(MODES_LIST[idx]);
  }
  if (pressed('rb')) {
    const activeModeBtn = document.querySelector('.mode-btn.bg-cyan-500');
    const currentMode = activeModeBtn ? activeModeBtn.getAttribute('data-mode') : 'gridshot';
    let idx = MODES_LIST.indexOf(currentMode);
    idx = (idx + 1) % MODES_LIST.length;
    selectMode(MODES_LIST[idx]);
  }

  // 8. D-Pad Down / Up: Cycle Esports Presets
  if (pressed('dpadDown') || pressed('dpadUp')) {
    const curPreset = engine.settings.activePreset || 'default';
    let pIdx = PRESETS_LIST.indexOf(curPreset);
    if (pIdx === -1) pIdx = 0;
    const step = pressed('dpadDown') ? 1 : -1;
    pIdx = (pIdx + step + PRESETS_LIST.length) % PRESETS_LIST.length;
    const nextPreset = PRESETS_LIST[pIdx];
    engine.applyPreset(nextPreset);
    engine.saveSettings();
    syncSettingsToUI();
    renderCurveSVG();
    const presetSelect = /** @type {HTMLSelectElement} */ (document.getElementById('preset-selector'));
    if (presetSelect) presetSelect.value = nextPreset;
  }

  // 9. D-Pad Left / Right: If Drawer is open, cycle tabs; otherwise cycle target shapes
  if (pressed('dpadLeft') || pressed('dpadRight')) {
    if (isDrawerOpen) {
      const tabTuner = document.getElementById('tab-tuner');
      const tabTarget = document.getElementById('tab-target');
      const tabMonitor = document.getElementById('tab-monitor');
      const pageTuner = document.getElementById('page-tuner');
      const pageTarget = document.getElementById('page-target');
      if (!pageTuner.classList.contains('hidden')) {
        tabTarget.click();
      } else if (!pageTarget.classList.contains('hidden')) {
        tabMonitor.click();
      } else {
        tabTuner.click();
      }
    } else {
      // Quick cycle target 3D geometry shape (Sphere -> Cube -> Octahedron)
      const shapes = ['sphere', 'cube', 'octahedron'];
      let sIdx = shapes.indexOf(range.targetConfig.shape || 'sphere');
      const step = pressed('dpadRight') ? 1 : -1;
      sIdx = (sIdx + step + shapes.length) % shapes.length;
      range.targetConfig.shape = shapes[sIdx];
      range.saveTargetConfig();
      syncSettingsToUI();
      if (range.mode === 'gridshot') range.spawnGridshotTargets();
      else if (range.mode === 'spidershot') range.spawnSpiderShotTarget();
      else if (range.mode === 'tracking') range.spawnTrackingTarget();
    }
  }

  // Update button edge states
  lastButtons.a = !!b.a;
  lastButtons.b = !!b.b;
  lastButtons.x = !!b.x;
  lastButtons.y = !!b.y;
  lastButtons.lb = !!b.lb;
  lastButtons.rb = !!b.rb;
  lastButtons.start = !!b.start;
  lastButtons.select = !!b.select || !!b.back;
  lastButtons.dpadUp = !!b.dpadUp;
  lastButtons.dpadDown = !!b.dpadDown;
  lastButtons.dpadLeft = !!b.dpadLeft;
  lastButtons.dpadRight = !!b.dpadRight;
}

// Start App
setupControlListeners();
syncSettingsToUI();
renderCurveSVG();
range.startSession('gridshot', 45);
requestAnimationFrame(mainLoop);
