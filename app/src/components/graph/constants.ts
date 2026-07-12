// ── Animation ───────────────────────────────────────
export const ACTIVATION_PULSE_SPEED = .8;
export const ACTIVATION_GLOW_MIN = 0.3;
export const ACTIVATION_GLOW_MAX = 0.8;
export const ACTIVATION_SCALE_MIN = 1;
export const ACTIVATION_SCALE_MAX = 2;
export const ACTIVATION_FADEOUT_SPEED = 4;

export const HOVER_SCALE = 1.3;
export const HOVER_LERP_SPEED = 10;
export const OPACITY_LERP_SPEED = 8;
export const DIM_OPACITY = 0.15;

// ── Activation timing (ms) ──────────────────────────
export const ACTIVATION_WAVE_DELAY = 100;     // задержка между узлами в цепочке
export const ACTIVATION_HOLD_DURATION = 200; // сколько держать подсветку
export const ACTIVATION_FADE_DELAY = 100;     // задержка между затуханием узлов

// ── Geometry ────────────────────────────────────────
export const NODE_SPHERE_RADIUS = 5;
export const NODE_SPHERE_SEGMENTS = 24;
export const GLOW_SPHERE_RADIUS = 5;

// ── Labels ──────────────────────────────────────────
export const NODE_LABEL_HEIGHT = 8;
export const NODE_LABEL_OFFSET_Y = 24;
export const NODE_LABEL_PROXIMITY = 200;

export const LINK_LABEL_HEIGHT = 3.5;
export const LINK_LABEL_PROXIMITY = 150;
export const LINK_LABEL_MAX_OPACITY = 0.7;
export const LINK_LABEL_OFFSET_Y = 4;

// ── Links ───────────────────────────────────────────
export const LINK_ARROW_LENGTH = 4;
export const LINK_WIDTH_DEFAULT = 0.5;
export const LINK_WIDTH_HIGHLIGHTED = 1.5;
export const LINK_WIDTH_ACTIVATED = 2;
export const LINK_OPACITY = 0.6;
export const LINK_MULTI_OFFSET = 8; // offset for parallel links

// ── Grouping ────────────────────────────────────────
export const GROUP_CLUSTER_STRENGTH = 0.1;
export const GROUP_RADIUS_MULTIPLIER = 30;



// ── Display modes ───────────────────────────────────
export type DisplayMode = 'simple' | 'clusters' | 'groups';