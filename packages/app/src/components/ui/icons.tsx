import { JSX, splitProps } from "solid-js";

interface IconProps extends JSX.SvgSVGAttributes<SVGSVGElement> {
  size?: number | string;
  theme?: "light" | "dark";
  connected?: boolean;
}

export const ConnectionIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "connected", "class"]);
  const size = () => local.size || 64;
  const color = () => (local.connected ? "#10b981" : "#64748b");
  const glowColor = () => (local.connected ? "#6ee7b7" : "#94a3b8");
  const innerColor = () => (local.connected ? "#d1fae5" : "#e2e8f0");

  return (
    <svg width={size()} height={size()} viewBox="-8 -8 80 80" fill="none" class={local.class} {...others}>
      <defs>
        <radialGradient id="conn-neon1">
          <stop offset="0%" stop-color={glowColor()} />
          <stop offset="50%" stop-color={color()} />
          <stop offset="100%" stop-color={color()} stop-opacity="0" />
        </radialGradient>
        <radialGradient id="conn-neon2">
          <stop offset="0%" stop-color={innerColor()} />
          <stop offset="100%" stop-color={color()} />
        </radialGradient>
        <filter id="conn-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform="translate(32, 32) scale(1.3) translate(-32, -32) translate(0, 4)">
        {/* Outer Glow */}
        <circle cx="16" cy="32" r="12" fill="url(#conn-neon1)" opacity="0.3" filter="url(#conn-glow)" />
        <circle cx="48" cy="32" r="12" fill="url(#conn-neon1)" opacity="0.3" filter="url(#conn-glow)" />

        {/* Energy Flow Path */}
        <path d="M 28 32 Q 32 20, 36 32 T 44 32" stroke={color()} stroke-width="4" fill="none" stroke-linecap="round" opacity="0.2" filter="url(#conn-glow)" />
        <path d="M 28 32 Q 32 20, 36 32 T 44 32" stroke={glowColor()} stroke-width="2.5" fill="none" stroke-linecap="round" opacity="0.6" />
        <path d="M 28 32 Q 32 20, 36 32 T 44 32" stroke={innerColor()} stroke-width="1.5" fill="none" stroke-linecap="round" />

        {/* Left Node */}
        <circle cx="16" cy="32" r="8" fill={color()} opacity="0.6" />
        <circle cx="16" cy="32" r="8" fill="url(#conn-neon2)" opacity="0.4" />
        <circle cx="16" cy="32" r="5" fill={color()} filter="url(#conn-glow)" />
        <circle cx="16" cy="32" r="3" fill={innerColor()} />
        <circle cx="14" cy="30" r="1.5" fill="#fff" opacity="0.8" />

        {/* Right Node */}
        <circle cx="48" cy="32" r="8" fill={color()} opacity="0.6" />
        <circle cx="48" cy="32" r="8" fill="url(#conn-neon2)" opacity="0.4" />
        <circle cx="48" cy="32" r="5" fill={color()} filter="url(#conn-glow)" />
        <circle cx="48" cy="32" r="3" fill={innerColor()} />
        <circle cx="46" cy="30" r="1.5" fill="#fff" opacity="0.8" />

        {/* Energy Particles */}
        <circle cx="32" cy="26" r="2" fill={innerColor()} filter="url(#conn-glow)">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="38" cy="30" r="1.5" fill={glowColor()} opacity="0.8">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" begin="0.5s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
};

// Dashboard - Holographic Data Cube
export const DashboardIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 64;

  return (
    <svg width={size()} height={size()} viewBox="4 0 56 64" fill="none" class={local.class} {...others}>
      <defs>
        <linearGradient id="dash-glass1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#60a5fa" />
          <stop offset="100%" stop-color="#3b82f6" />
        </linearGradient>
        <linearGradient id="dash-glass2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#93c5fd" />
          <stop offset="100%" stop-color="#60a5fa" />
        </linearGradient>
        <radialGradient id="dash-glow">
          <stop offset="0%" stop-color="#bfdbfe" />
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
        </radialGradient>
        <filter id="dash-shadow">
          <feGaussianBlur stdDeviation="2" />
        </filter>
        <filter id="dash-bright">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Bottom Glow */}
      <ellipse cx="32" cy="50" rx="24" ry="6" fill="url(#dash-glow)" opacity="0.4" />

      {/* 3D Cube Frame - Back edges */}
      <path d="M 18 24 L 18 44" stroke="#1e40af" stroke-width="1.5" opacity="0.3" />
      <path d="M 18 44 L 46 44" stroke="#1e40af" stroke-width="1.5" opacity="0.3" />
      <path d="M 46 44 L 46 24" stroke="#1e40af" stroke-width="1.5" opacity="0.3" />

      {/* Glass Panel - Left side */}
      <path d="M 18 24 L 24 20 L 24 40 L 18 44 Z" fill="url(#dash-glass1)" opacity="0.3" />
      <path d="M 18 24 L 24 20 L 24 40 L 18 44 Z" fill="#1e3a8a" opacity="0.2" />

      {/* Glass Panel - Right side */}
      <path d="M 46 24 L 52 20 L 52 40 L 46 44 Z" fill="url(#dash-glass1)" opacity="0.4" />
      <path d="M 46 24 L 52 20 L 52 40 L 46 44 Z" fill="#1e3a8a" opacity="0.15" />

      {/* Glass Panel - Top side */}
      <path d="M 18 24 L 24 20 L 52 20 L 46 24 Z" fill="url(#dash-glass2)" opacity="0.6" />
      <path d="M 18 24 L 24 20 L 52 20 L 46 24 Z" fill="#dbeafe" opacity="0.2" />

      {/* Front Glowing Border */}
      <path d="M 18 24 L 46 24 L 46 44 L 18 44 Z" fill="none" stroke="url(#dash-glass1)" stroke-width="2" filter="url(#dash-bright)" />
      <path d="M 18 24 L 46 24 L 46 44 L 18 44 Z" fill="none" stroke="#60a5fa" stroke-width="1" />

      {/* Inner Grid - Neon effect */}
      <line x1="18" y1="30" x2="46" y2="30" stroke="#3b82f6" stroke-width="1" opacity="0.6" filter="url(#dash-bright)" />
      <line x1="18" y1="38" x2="46" y2="38" stroke="#3b82f6" stroke-width="1" opacity="0.6" filter="url(#dash-bright)" />
      <line x1="28" y1="24" x2="28" y2="44" stroke="#3b82f6" stroke-width="1" opacity="0.6" filter="url(#dash-bright)" />
      <line x1="36" y1="24" x2="36" y2="44" stroke="#3b82f6" stroke-width="1" opacity="0.6" filter="url(#dash-bright)" />

      {/* Highlight Point */}
      <circle cx="44" cy="26" r="3" fill="#bfdbfe" opacity="0.6" filter="url(#dash-bright)" />
      <circle cx="44" cy="26" r="1.5" fill="#fff" opacity="0.9" />

      {/* Data Flow Particles */}
      <circle cx="23" cy="34" r="1" fill="#60a5fa" filter="url(#dash-bright)">
        <animate attributeName="cy" values="34;28;34" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="32" cy="30" r="1" fill="#93c5fd" filter="url(#dash-bright)">
        <animate attributeName="cy" values="30;36;30" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};

// HQL - Cyberpunk Terminal
export const HQLIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 64;

  return (
    <svg width={size()} height={size()} viewBox="-8 -8 80 80" fill="none" class={local.class} {...others}>
      <defs>
        <linearGradient id="hql-screen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#1e3a3a" />
          <stop offset="100%" stop-color="#0f1f2a" />
        </linearGradient>
        <radialGradient id="hql-scanline">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="hql-ambient">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.15" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0" />
        </radialGradient>
        <filter id="hql-glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="hql-outer-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform="translate(32, 34) scale(1.15) translate(-32,-34)">
        {/* Ambient Green Glow Behind Screen */}
        <rect x="6" y="10" width="52" height="44" rx="8" fill="url(#hql-ambient)" />

        {/* Screen Frame */}
        <rect x="10" y="14" width="44" height="36" rx="4" fill="#0f172a" />
        <rect x="10" y="14" width="44" height="36" rx="4" fill="url(#hql-screen)" opacity="0.85" />

        {/* Frame Highlight - brighter border */}
        <rect x="10" y="14" width="44" height="36" rx="4" fill="none" stroke="#4b6a5e" stroke-width="1.2" filter="url(#hql-outer-glow)" />
        <rect x="11" y="15" width="42" height="34" rx="3" fill="none" stroke="#2a3f3a" stroke-width="0.5" />

        {/* Scanline Effect */}
        <rect x="12" y="16" width="40" height="32" rx="2" fill="url(#hql-scanline)" opacity="0.2">
          <animate attributeName="y" values="16;48;16" dur="3s" repeatCount="indefinite" />
        </rect>

        {/* Neon Green Code Lines - brighter */}
        <g filter="url(#hql-glow)">
          <rect x="16" y="22" width="3" height="2" rx="0.5" fill="#34d399" opacity="1" />
          <rect x="21" y="22" width="18" height="2" rx="0.5" fill="#6ee7b7" opacity="0.75" />

          <rect x="16" y="28" width="8" height="2" rx="0.5" fill="#6ee7b7" opacity="0.85" />
          <rect x="26" y="28" width="14" height="2" rx="0.5" fill="#34d399" opacity="0.65" />

          <rect x="16" y="34" width="12" height="2" rx="0.5" fill="#34d399" opacity="0.9" />
          <rect x="30" y="34" width="10" height="2" rx="0.5" fill="#a7f3d0" opacity="0.7" />

          <rect x="16" y="40" width="3" height="2" rx="0.5" fill="#34d399" opacity="1" />
          <rect x="21" y="40" width="8" height="2" rx="0.5" fill="#6ee7b7" opacity="0.65" />
        </g>

        {/* Blinking Cursor */}
        <rect x="31" y="40" width="2" height="3" rx="0.5" fill="#10b981" filter="url(#hql-glow)">
          <animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite" />
        </rect>

        {/* Status LED */}
        <circle cx="48" cy="19" r="1.5" fill="#10b981" filter="url(#hql-glow)">
          <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
        </circle>

        <rect x="10" y="50" width="44" height="2" rx="1" fill="#2a4a3e" opacity="0.7" />
      </g>
    </svg>
  );
};

// Queries - DNA Spiral Data Stream
export const QueriesIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 64;

  return (
    <svg width={size()} height={size()} viewBox="-6 -4 76 72" fill="none" class={local.class} {...others}>
      <defs>
        <linearGradient id="dna-grad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fcd34d" />
          <stop offset="50%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#d97706" />
        </linearGradient>
        <linearGradient id="dna-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fef3c7" />
          <stop offset="50%" stop-color="#fde68a" />
          <stop offset="100%" stop-color="#fcd34d" />
        </linearGradient>
        <radialGradient id="dna-glow">
          <stop offset="0%" stop-color="#fef3c7" />
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0" />
        </radialGradient>
        <filter id="dna-bright" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer Halo */}
      <circle cx="32" cy="32" r="26" fill="url(#dna-glow)" opacity="0.2" />

      {/* DNA Left Chain - Query Path */}
      <path d="M 24 12 Q 20 18, 22 24 T 24 36 T 22 48 T 24 56" stroke="url(#dna-grad1)" stroke-width="3.5" fill="none" stroke-linecap="round" filter="url(#dna-bright)" />
      <path d="M 24 12 Q 20 18, 22 24 T 24 36 T 22 48 T 24 56" stroke="#fef3c7" stroke-width="1.5" fill="none" stroke-linecap="round" />

      {/* DNA Right Chain */}
      <path d="M 40 12 Q 44 18, 42 24 T 40 36 T 42 48 T 40 56" stroke="url(#dna-grad1)" stroke-width="3.5" fill="none" stroke-linecap="round" filter="url(#dna-bright)" />
      <path d="M 40 12 Q 44 18, 42 24 T 40 36 T 42 48 T 40 56" stroke="#fef3c7" stroke-width="1.5" fill="none" stroke-linecap="round" />

      {/* Rungs - Data Nodes */}
      <g filter="url(#dna-bright)">
        <line x1="24" y1="16" x2="40" y2="16" stroke="url(#dna-grad2)" stroke-width="2.5" stroke-linecap="round" />
        <line x1="23" y1="24" x2="41" y2="24" stroke="url(#dna-grad2)" stroke-width="2.5" stroke-linecap="round" />
        <line x1="24" y1="32" x2="40" y2="32" stroke="url(#dna-grad2)" stroke-width="2.5" stroke-linecap="round" />
        <line x1="23" y1="40" x2="41" y2="40" stroke="url(#dna-grad2)" stroke-width="2.5" stroke-linecap="round" />
        <line x1="24" y1="48" x2="40" y2="48" stroke="url(#dna-grad2)" stroke-width="2.5" stroke-linecap="round" />
      </g>

      {/* Node Spheres */}
      <g filter="url(#dna-bright)">
        <circle cx="24" cy="16" r="3" fill="#f59e0b" />
        <circle cx="24" cy="16" r="2" fill="#fef3c7" />

        <circle cx="40" cy="16" r="3" fill="#f59e0b" />
        <circle cx="40" cy="16" r="2" fill="#fef3c7" />

        <circle cx="23" cy="24" r="3.5" fill="#f59e0b" />
        <circle cx="23" cy="24" r="2.5" fill="#fde68a" />
        <circle cx="23" cy="24" r="1.5" fill="#fff" opacity="0.8" />

        <circle cx="41" cy="24" r="3.5" fill="#f59e0b" />
        <circle cx="41" cy="24" r="2.5" fill="#fde68a" />

        <circle cx="24" cy="32" r="3" fill="#f59e0b" />
        <circle cx="24" cy="32" r="2" fill="#fef3c7" />

        <circle cx="40" cy="32" r="3" fill="#f59e0b" />
        <circle cx="40" cy="32" r="2" fill="#fef3c7" />

        <circle cx="23" cy="40" r="3.5" fill="#f59e0b" />
        <circle cx="23" cy="40" r="2.5" fill="#fde68a" />

        <circle cx="41" cy="40" r="3.5" fill="#f59e0b" />
        <circle cx="41" cy="40" r="2.5" fill="#fde68a" />
        <circle cx="41" cy="40" r="1.5" fill="#fff" opacity="0.8" />

        <circle cx="24" cy="48" r="3" fill="#f59e0b" />
        <circle cx="24" cy="48" r="2" fill="#fef3c7" />

        <circle cx="40" cy="48" r="3" fill="#f59e0b" />
        <circle cx="40" cy="48" r="2" fill="#fef3c7" />
      </g>

      {/* Energy Particles */}
      <circle cx="32" cy="20" r="1.5" fill="#fde68a" filter="url(#dna-bright)">
        <animate attributeName="cy" values="20;44;20" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="32" cy="44" r="1.5" fill="#fcd34d" filter="url(#dna-bright)">
        <animate attributeName="cy" values="44;20;44" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};

// Modeler - Magnetic Node Network
export const ModelerIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 64;

  return (
    <svg width={size()} height={size()} viewBox="-6 -6 76 76" fill="none" class={local.class} {...others}>
      <defs>
        <radialGradient id="mod-node1">
          <stop offset="0%" stop-color="#fed7aa" />
          <stop offset="50%" stop-color="#fb923c" />
          <stop offset="100%" stop-color="#ea580c" />
        </radialGradient>
        <radialGradient id="mod-node2">
          <stop offset="0%" stop-color="#ffedd5" />
          <stop offset="70%" stop-color="#fdba74" />
          <stop offset="100%" stop-color="#f97316" />
        </radialGradient>
        <radialGradient id="mod-field">
          <stop offset="0%" stop-color="#fed7aa" stop-opacity="0.4" />
          <stop offset="100%" stop-color="#ea580c" stop-opacity="0" />
        </radialGradient>
        <filter id="mod-glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Magnetic Field */}
      <circle cx="32" cy="20" r="16" fill="url(#mod-field)" />
      <circle cx="20" cy="44" r="14" fill="url(#mod-field)" />
      <circle cx="44" cy="44" r="14" fill="url(#mod-field)" />

      {/* Energy Beams */}
      <path d="M 32 26 L 20 40" stroke="#f97316" stroke-width="3" opacity="0.2" filter="url(#mod-glow)" />
      <path d="M 32 26 L 44 40" stroke="#f97316" stroke-width="3" opacity="0.2" filter="url(#mod-glow)" />
      <path d="M 32 26 L 20 40" stroke="#fb923c" stroke-width="2" opacity="0.4" />
      <path d="M 32 26 L 44 40" stroke="#fb923c" stroke-width="2" opacity="0.4" />
      <path d="M 32 26 L 20 40" stroke="#fdba74" stroke-width="1" opacity="0.8" />
      <path d="M 32 26 L 44 40" stroke="#fdba74" stroke-width="1" opacity="0.8" />

      {/* Top Node */}
      <circle cx="32" cy="20" r="10" fill="url(#mod-node1)" filter="url(#mod-glow)" />
      <circle cx="32" cy="20" r="7" fill="url(#mod-node2)" />
      <circle cx="32" cy="20" r="4" fill="#fff" opacity="0.6" />
      <circle cx="30" cy="18" r="2" fill="#fff" opacity="0.9" />

      {/* Data Field Lines */}
      <line x1="28" y1="23" x2="36" y2="23" stroke="#7c2d12" stroke-width="0.5" opacity="0.6" />
      <line x1="28" y1="25" x2="34" y2="25" stroke="#7c2d12" stroke-width="0.5" opacity="0.4" />

      {/* Bottom Left Node */}
      <circle cx="20" cy="44" r="9" fill="url(#mod-node1)" filter="url(#mod-glow)" />
      <circle cx="20" cy="44" r="6" fill="url(#mod-node2)" />
      <circle cx="20" cy="44" r="3.5" fill="#fff" opacity="0.5" />
      <circle cx="18" cy="42" r="1.5" fill="#fff" opacity="0.9" />

      <line x1="17" y1="46" x2="23" y2="46" stroke="#7c2d12" stroke-width="0.5" opacity="0.6" />
      <line x1="17" y1="48" x2="21" y2="48" stroke="#7c2d12" stroke-width="0.5" opacity="0.4" />

      {/* Bottom Right Node */}
      <circle cx="44" cy="44" r="9" fill="url(#mod-node1)" filter="url(#mod-glow)" />
      <circle cx="44" cy="44" r="6" fill="url(#mod-node2)" />
      <circle cx="44" cy="44" r="3.5" fill="#fff" opacity="0.5" />
      <circle cx="42" cy="42" r="1.5" fill="#fff" opacity="0.9" />

      <line x1="41" y1="46" x2="47" y2="46" stroke="#7c2d12" stroke-width="0.5" opacity="0.6" />
      <line x1="41" y1="48" x2="45" y2="48" stroke="#7c2d12" stroke-width="0.5" opacity="0.4" />

      {/* Energy Pulse Particles */}
      <circle cx="26" cy="33" r="1.5" fill="#fed7aa" filter="url(#mod-glow)">
        <animate attributeName="r" values="1.5;2.5;1.5" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx="38" cy="33" r="1.5" fill="#fdba74" filter="url(#mod-glow)">
        <animate attributeName="r" values="1.5;2.5;1.5" dur="2s" begin="1s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" begin="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};

// Schema - Liquid Data Layer
export const SchemaIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 64;

  return (
    <svg width={size()} height={size()} viewBox="-8 -8 80 80" fill="none" class={local.class} {...others}>
      <defs>
        <linearGradient id="sch-layer1" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#93c5fd" />
          <stop offset="100%" stop-color="#3b82f6" />
        </linearGradient>
        <linearGradient id="sch-layer2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#bfdbfe" />
          <stop offset="100%" stop-color="#60a5fa" />
        </linearGradient>
        <linearGradient id="sch-layer3" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#dbeafe" />
          <stop offset="100%" stop-color="#93c5fd" />
        </linearGradient>
        <radialGradient id="sch-shine">
          <stop offset="0%" stop-color="#fff" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#fff" stop-opacity="0" />
        </radialGradient>
        <filter id="sch-glow">
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Bottom Shadow */}
      <ellipse cx="32" cy="52" rx="24" ry="3" fill="#1e40af" opacity="0.3" />

      {/* Bottom Liquid */}
      <ellipse cx="32" cy="46" rx="24" ry="7" fill="url(#sch-layer1)" opacity="0.6" />
      <path d="M 8 46 Q 8 50, 12 52 T 32 54 T 52 52 Q 56 50, 56 46" fill="#1e40af" opacity="0.4" />
      <ellipse cx="32" cy="46" rx="24" ry="7" fill="url(#sch-layer1)" filter="url(#sch-glow)" opacity="0.3" />

      {/* Middle Liquid */}
      <ellipse cx="32" cy="34" rx="24" ry="7" fill="url(#sch-layer2)" opacity="0.7" />
      <path d="M 8 34 Q 8 38, 12 40 T 32 42 T 52 40 Q 56 38, 56 34" fill="#2563eb" opacity="0.3" />
      <ellipse cx="32" cy="34" rx="24" ry="7" fill="url(#sch-layer2)" filter="url(#sch-glow)" opacity="0.3" />

      {/* Top Liquid */}
      <ellipse cx="32" cy="22" rx="24" ry="7" fill="url(#sch-layer3)" />
      <path d="M 8 22 Q 8 26, 12 28 T 32 30 T 52 28 Q 56 26, 56 22" fill="#3b82f6" opacity="0.2" />
      <ellipse cx="32" cy="22" rx="24" ry="7" fill="url(#sch-layer3)" filter="url(#sch-glow)" opacity="0.4" />

      {/* Surface Shine */}
      <ellipse cx="32" cy="21" rx="18" ry="4" fill="url(#sch-shine)" />
      <ellipse cx="26" cy="20" rx="6" ry="2" fill="#fff" opacity="0.4" />

      {/* Data Ripples */}
      <ellipse cx="32" cy="22" rx="20" ry="5" fill="none" stroke="#dbeafe" stroke-width="0.5" opacity="0.4" />
      <ellipse cx="32" cy="22" rx="16" ry="4" fill="none" stroke="#fff" stroke-width="0.3" opacity="0.3" />

      {/* Data Flow Particles */}
      <circle cx="20" cy="24" r="1" fill="#fff" filter="url(#sch-glow)">
        <animate attributeName="cy" values="24;36;24" dur="4s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="4s" repeatCount="indefinite" />
      </circle>
      <circle cx="44" cy="36" r="1" fill="#bfdbfe" filter="url(#sch-glow)">
        <animate attributeName="cy" values="36;48;36" dur="3.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0.3;0.8" dur="3.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="32" cy="28" r="0.8" fill="#fff" filter="url(#sch-glow)">
        <animate attributeName="cy" values="28;40;28" dur="4.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.9;0.2;0.9" dur="4.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};

// Graph - Quantum Network Nodes
export const GraphIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 64;

  return (
    <svg width={size()} height={size()} viewBox="-8 -8 80 80" fill="none" class={local.class} {...others}>
      <defs>
        <radialGradient id="graph-core">
          <stop offset="0%" stop-color="#f3e8ff" />
          <stop offset="30%" stop-color="#e9d5ff" />
          <stop offset="70%" stop-color="#c084fc" />
          <stop offset="100%" stop-color="#9333ea" />
        </radialGradient>
        <radialGradient id="graph-node">
          <stop offset="0%" stop-color="#e9d5ff" />
          <stop offset="100%" stop-color="#a855f7" />
        </radialGradient>
        <radialGradient id="graph-field">
          <stop offset="0%" stop-color="#e9d5ff" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#9333ea" stop-opacity="0" />
        </radialGradient>
        <filter id="graph-glow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Quantum Field */}
      <circle cx="32" cy="32" r="28" fill="url(#graph-field)" />

      {/* Main Connection Lines - Neon Effect */}
      <line x1="32" y1="32" x2="18" y2="18" stroke="#9333ea" stroke-width="2.5" opacity="0.2" filter="url(#graph-glow)" />
      <line x1="32" y1="32" x2="46" y2="18" stroke="#9333ea" stroke-width="2.5" opacity="0.2" filter="url(#graph-glow)" />
      <line x1="32" y1="32" x2="18" y2="46" stroke="#9333ea" stroke-width="2.5" opacity="0.2" filter="url(#graph-glow)" />
      <line x1="32" y1="32" x2="46" y2="46" stroke="#9333ea" stroke-width="2.5" opacity="0.2" filter="url(#graph-glow)" />

      <line x1="32" y1="32" x2="18" y2="18" stroke="#c084fc" stroke-width="1.5" opacity="0.5" />
      <line x1="32" y1="32" x2="46" y2="18" stroke="#c084fc" stroke-width="1.5" opacity="0.5" />
      <line x1="32" y1="32" x2="18" y2="46" stroke="#c084fc" stroke-width="1.5" opacity="0.5" />
      <line x1="32" y1="32" x2="46" y2="46" stroke="#c084fc" stroke-width="1.5" opacity="0.5" />

      {/* Secondary Connections */}
      <line x1="18" y1="18" x2="46" y2="18" stroke="#a855f7" stroke-width="1" opacity="0.2" />
      <line x1="18" y1="46" x2="46" y2="46" stroke="#a855f7" stroke-width="1" opacity="0.2" />
      <line x1="18" y1="18" x2="18" y2="46" stroke="#a855f7" stroke-width="1" opacity="0.2" />
      <line x1="46" y1="18" x2="46" y2="46" stroke="#a855f7" stroke-width="1" opacity="0.2" />

      {/* External Nodes */}
      <g filter="url(#graph-glow)">
        <circle cx="18" cy="18" r="6" fill="url(#graph-node)" />
        <circle cx="18" cy="18" r="4" fill="#e9d5ff" />
        <circle cx="18" cy="18" r="2" fill="#fff" opacity="0.8" />

        <circle cx="46" cy="18" r="6" fill="url(#graph-node)" />
        <circle cx="46" cy="18" r="4" fill="#e9d5ff" />
        <circle cx="46" cy="18" r="2" fill="#fff" opacity="0.8" />

        <circle cx="18" cy="46" r="6" fill="url(#graph-node)" />
        <circle cx="18" cy="46" r="4" fill="#e9d5ff" />
        <circle cx="18" cy="46" r="2" fill="#fff" opacity="0.8" />

        <circle cx="46" cy="46" r="6" fill="url(#graph-node)" />
        <circle cx="46" cy="46" r="4" fill="#e9d5ff" />
        <circle cx="46" cy="46" r="2" fill="#fff" opacity="0.8" />
      </g>

      {/* Center Core Node */}
      <circle cx="32" cy="32" r="12" fill="url(#graph-core)" filter="url(#graph-glow)" />
      <circle cx="32" cy="32" r="8" fill="url(#graph-core)" />
      <circle cx="32" cy="32" r="5" fill="#f3e8ff" />
      <circle cx="30" cy="30" r="2.5" fill="#fff" />

      {/* Quantum Energy Ring */}
      <circle cx="32" cy="32" r="10" fill="none" stroke="#e9d5ff" stroke-width="0.5" opacity="0.4">
        <animate attributeName="r" values="10;14;10" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
      </circle>

      {/* Particle Orbit */}
      <circle cx="32" cy="20" r="1.5" fill="#e9d5ff" filter="url(#graph-glow)">
        <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};

// Others - Rainbow Spectrum Cube
export const OthersIcon = (props: IconProps) => {
  const [local, others] = splitProps(props, ["size", "theme", "class"]);
  const size = () => local.size || 64;

  return (
    <svg width={size()} height={size()} viewBox="-8 -8 80 80" fill="none" class={local.class} {...others}>
      <defs>
        <linearGradient id="oth-top" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cbd5e1" />
          <stop offset="100%" stop-color="#94a3b8" />
        </linearGradient>
        <linearGradient id="oth-left" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#475569" />
          <stop offset="100%" stop-color="#64748b" />
        </linearGradient>
        <linearGradient id="oth-right" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#64748b" />
          <stop offset="100%" stop-color="#475569" />
        </linearGradient>
        <filter id="oth-glow">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g transform="translate(32, 32) scale(1.2) translate(-32,-32)">
        {/* Shadow */}
        <ellipse cx="32" cy="52" rx="16" ry="3" fill="#1e293b" opacity="0.4" />

        {/* 3D Cube - Top face */}
        <path d="M 32 18 L 46 24 L 32 30 L 18 24 Z" fill="url(#oth-top)" />

        {/* Left face */}
        <path d="M 18 24 L 18 40 L 32 46 L 32 30 Z" fill="url(#oth-left)" />

        {/* Right face */}
        <path d="M 32 30 L 32 46 L 46 40 L 46 24 Z" fill="url(#oth-right)" />

        {/* Color Grid - Left face */}
        <g filter="url(#oth-glow)">
          <circle cx="22" cy="32" r="2" fill="#3b82f6" opacity="0.8" />
          <circle cx="22" cy="38" r="2" fill="#8b5cf6" opacity="0.7" />
          <circle cx="28" cy="35" r="2" fill="#10b981" opacity="0.8" />
          <circle cx="28" cy="41" r="2" fill="#f59e0b" opacity="0.7" />
        </g>

        {/* Color Grid - Right face */}
        <g filter="url(#oth-glow)">
          <circle cx="36" cy="35" r="2" fill="#ec4899" opacity="0.8" />
          <circle cx="36" cy="41" r="2" fill="#ef4444" opacity="0.7" />
          <circle cx="42" cy="32" r="2" fill="#06b6d4" opacity="0.8" />
          <circle cx="42" cy="38" r="2" fill="#f97316" opacity="0.7" />
        </g>

        {/* Color Grid - Top face */}
        <g filter="url(#oth-glow)">
          <circle cx="28" cy="23" r="1.5" fill="#a78bfa" opacity="0.9" />
          <circle cx="32" cy="21" r="1.5" fill="#60a5fa" opacity="0.9" />
          <circle cx="36" cy="23" r="1.5" fill="#34d399" opacity="0.9" />
          <circle cx="32" cy="25" r="1.5" fill="#fbbf24" opacity="0.9" />
        </g>

        {/* Top Highlight */}
        <path d="M 32 18 L 38 21 L 32 24 L 26 21 Z" fill="#fff" opacity="0.2" />

        {/* Edge Highlights */}
        <path d="M 32 18 L 46 24 L 32 30" fill="none" stroke="#e2e8f0" stroke-width="0.5" opacity="0.4" />
        <path d="M 18 24 L 18 40" stroke="#334155" stroke-width="0.5" opacity="0.3" />
        <path d="M 46 24 L 46 40" stroke="#94a3b8" stroke-width="0.5" opacity="0.2" />
      </g>
    </svg>
  );
};
