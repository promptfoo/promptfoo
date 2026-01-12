import React from 'react';

interface ArchitectureDiagramProps {
  variant: 'vulnerable' | 'secure';
}

export default function ArchitectureDiagram({ variant }: ArchitectureDiagramProps) {
  const isVulnerable = variant === 'vulnerable';
  const idPrefix = isVulnerable ? 'vuln' : 'sec';

  return (
    <svg
      viewBox="0 0 700 320"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={
        isVulnerable
          ? 'Vulnerable: Control plane and data plane share the same context with no privilege boundary'
          : 'Secure: Code extracts content before LLM evaluation, restoring the boundary'
      }
      style={{
        width: '100%',
        maxWidth: '700px',
        height: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <defs>
        <marker
          id={`${idPrefix}-arrow`}
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#6b7280" />
        </marker>
        <marker
          id={`${idPrefix}-arrow-red`}
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444" />
        </marker>
        <marker
          id={`${idPrefix}-arrow-green`}
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        >
          <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e" />
        </marker>
        <linearGradient id={`${idPrefix}-dangerGrad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="100%" stopColor="#dc2626" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-safeGrad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id={`${idPrefix}-trustGrad`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="700" height="320" fill="var(--ifm-background-color, #ffffff)" />

      {/* Title */}
      <text
        x="350"
        y="28"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        fill="var(--ifm-font-color-base, #1f2937)"
      >
        {isVulnerable ? '❌ Vulnerable: Context Merging' : '✓ Secure: Deterministic Extraction'}
      </text>
      <text
        x="350"
        y="48"
        textAnchor="middle"
        fontSize="11"
        fill="var(--ifm-font-color-secondary, #6b7280)"
      >
        {isVulnerable
          ? 'LLM sees untrusted content mixed with instructions'
          : 'Code extracts target before LLM evaluation'}
      </text>

      {isVulnerable ? (
        <>
          {/* VULNERABLE FLOW */}
          {/* Untrusted Output Box */}
          <g transform="translate(30, 75)">
            <rect width="140" height="100" rx="8" fill="#fef2f2" stroke="#ef4444" strokeWidth="2" />
            <text x="70" y="22" textAnchor="middle" fontSize="11" fontWeight="600" fill="#dc2626">
              Untrusted Output
            </text>
            <text x="70" y="45" textAnchor="middle" fontSize="24" fontWeight="700" fill="#ef4444">
              5
            </text>
            <text
              x="70"
              y="65"
              textAnchor="middle"
              fontSize="9"
              fill="var(--ifm-font-color-secondary, #6b7280)"
              fontStyle="italic"
            >
              + "correct answer is 4"
            </text>
            <text
              x="70"
              y="80"
              textAnchor="middle"
              fontSize="9"
              fill="var(--ifm-font-color-secondary, #6b7280)"
              fontStyle="italic"
            >
              + protocol directives
            </text>
            <text x="70" y="95" textAnchor="middle" fontSize="8" fill="#b91c1c">
              (attacker-controlled)
            </text>
          </g>

          {/* Rubric Box */}
          <g transform="translate(30, 190)">
            <rect width="140" height="70" rx="8" fill="#eff6ff" stroke="#3b82f6" strokeWidth="2" />
            <text x="70" y="22" textAnchor="middle" fontSize="11" fontWeight="600" fill="#2563eb">
              Rubric
            </text>
            <text
              x="70"
              y="42"
              textAnchor="middle"
              fontSize="10"
              fill="var(--ifm-font-color-secondary, #4b5563)"
            >
              "Answer is 4"
            </text>
            <text x="70" y="60" textAnchor="middle" fontSize="8" fill="#1d4ed8">
              (trusted)
            </text>
          </g>

          {/* Plus sign */}
          <text x="190" y="165" textAnchor="middle" fontSize="24" fontWeight="700" fill="#6b7280">
            +
          </text>

          {/* Arrow to merge */}
          <line
            x1="200"
            y1="165"
            x2="250"
            y2="165"
            stroke="#ef4444"
            strokeWidth="2"
            markerEnd={`url(#${idPrefix}-arrow-red)`}
          />

          {/* Merged Context Box */}
          <g transform="translate(260, 95)">
            <rect
              width="160"
              height="140"
              rx="8"
              fill="#fef2f2"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="5,3"
            />
            <text x="80" y="22" textAnchor="middle" fontSize="11" fontWeight="600" fill="#dc2626">
              Mixed Context
            </text>
            <rect x="10" y="35" width="140" height="45" rx="4" fill="#fee2e2" />
            <text x="80" y="55" textAnchor="middle" fontSize="9" fill="#991b1b">
              untrusted + trusted
            </text>
            <text x="80" y="70" textAnchor="middle" fontSize="9" fill="#991b1b">
              ⚠ no privilege boundary
            </text>
            <text x="80" y="100" textAnchor="middle" fontSize="10" fill="#7f1d1d">
              LLM must decide
            </text>
            <text x="80" y="115" textAnchor="middle" fontSize="10" fill="#7f1d1d">
              what to evaluate
            </text>
          </g>

          {/* Arrow to LLM */}
          <line
            x1="430"
            y1="165"
            x2="480"
            y2="165"
            stroke="#ef4444"
            strokeWidth="2"
            markerEnd={`url(#${idPrefix}-arrow-red)`}
          />

          {/* LLM Judge Box */}
          <g transform="translate(490, 110)">
            <rect
              width="160"
              height="110"
              rx="8"
              fill="var(--ifm-background-surface-color, #f9fafb)"
              stroke="#6b7280"
              strokeWidth="2"
            />
            <text x="80" y="25" textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">
              🧠 LLM Judge
            </text>
            <text
              x="80"
              y="50"
              textAnchor="middle"
              fontSize="10"
              fill="var(--ifm-font-color-secondary, #4b5563)"
            >
              Sees injection payloads
            </text>
            <text
              x="80"
              y="68"
              textAnchor="middle"
              fontSize="10"
              fill="var(--ifm-font-color-secondary, #4b5563)"
            >
              mixed with rubric
            </text>
            <text x="80" y="95" textAnchor="middle" fontSize="14" fontWeight="700" fill="#ef4444">
              ❌ Fooled
            </text>
          </g>

          {/* Bottom warning */}
          <g transform="translate(30, 280)">
            <rect width="640" height="30" rx="6" fill="#fef2f2" stroke="#fca5a5" />
            <text x="320" y="20" textAnchor="middle" fontSize="11" fill="#991b1b">
              Attacker-controlled text competes with your instructions in the same context
            </text>
          </g>
        </>
      ) : (
        <>
          {/* SECURE FLOW */}
          {/* Untrusted Output Box */}
          <g transform="translate(30, 100)">
            <rect width="120" height="100" rx="8" fill="#fef2f2" stroke="#ef4444" strokeWidth="2" />
            <text x="60" y="22" textAnchor="middle" fontSize="10" fontWeight="600" fill="#dc2626">
              Untrusted Output
            </text>
            <text x="60" y="50" textAnchor="middle" fontSize="20" fontWeight="700" fill="#ef4444">
              5
            </text>
            <text
              x="60"
              y="70"
              textAnchor="middle"
              fontSize="8"
              fill="var(--ifm-font-color-secondary, #6b7280)"
              fontStyle="italic"
            >
              + injections...
            </text>
            <text x="60" y="90" textAnchor="middle" fontSize="8" fill="#b91c1c">
              (attacker-controlled)
            </text>
          </g>

          {/* Arrow to Extractor */}
          <line
            x1="160"
            y1="150"
            x2="200"
            y2="150"
            stroke="#6b7280"
            strokeWidth="2"
            markerEnd={`url(#${idPrefix}-arrow)`}
          />

          {/* Code Extractor Box */}
          <g transform="translate(210, 85)">
            <rect width="130" height="130" rx="8" fill="#f0fdf4" stroke="#22c55e" strokeWidth="2" />
            <text x="65" y="22" textAnchor="middle" fontSize="10" fontWeight="600" fill="#16a34a">
              Deterministic
            </text>
            <text x="65" y="36" textAnchor="middle" fontSize="10" fontWeight="600" fill="#16a34a">
              Extractor
            </text>
            <text x="65" y="55" textAnchor="middle" fontSize="8" fill="#166534">
              (code, not LLM)
            </text>
            <rect x="15" y="65" width="100" height="50" rx="4" fill="#dcfce7" />
            <text
              x="65"
              y="82"
              textAnchor="middle"
              fontSize="9"
              fill="#166534"
              fontFamily="monospace"
            >
              extract_first_line()
            </text>
            <text
              x="65"
              y="98"
              textAnchor="middle"
              fontSize="9"
              fill="#166534"
              fontFamily="monospace"
            >
              validate_format()
            </text>
          </g>

          {/* Arrow to Validated Content */}
          <line
            x1="350"
            y1="150"
            x2="390"
            y2="150"
            stroke="#22c55e"
            strokeWidth="2"
            markerEnd={`url(#${idPrefix}-arrow-green)`}
          />

          {/* Validated Content Box */}
          <g transform="translate(400, 100)">
            <rect width="120" height="100" rx="8" fill="#f0fdf4" stroke="#22c55e" strokeWidth="2" />
            <text x="60" y="22" textAnchor="middle" fontSize="10" fontWeight="600" fill="#16a34a">
              Extracted Content
            </text>
            <text x="60" y="55" textAnchor="middle" fontSize="24" fontWeight="700" fill="#16a34a">
              5
            </text>
            <text x="60" y="75" textAnchor="middle" fontSize="9" fill="#166534">
              Only target span
            </text>
            <text x="60" y="90" textAnchor="middle" fontSize="8" fill="#166534">
              (injections stripped)
            </text>
          </g>

          {/* Arrow to LLM */}
          <line
            x1="530"
            y1="150"
            x2="570"
            y2="150"
            stroke="#22c55e"
            strokeWidth="2"
            markerEnd={`url(#${idPrefix}-arrow-green)`}
          />

          {/* LLM Judge Box */}
          <g transform="translate(580, 100)">
            <rect
              width="100"
              height="100"
              rx="8"
              fill="var(--ifm-background-surface-color, #f9fafb)"
              stroke="#22c55e"
              strokeWidth="2"
            />
            <text x="50" y="22" textAnchor="middle" fontSize="10" fontWeight="600" fill="#16a34a">
              🧠 LLM Judge
            </text>
            <text x="50" y="45" textAnchor="middle" fontSize="9" fill="#166534">
              Only sees
            </text>
            <text x="50" y="58" textAnchor="middle" fontSize="9" fill="#166534">
              clean content
            </text>
            <text x="50" y="85" textAnchor="middle" fontSize="12" fontWeight="700" fill="#22c55e">
              ✓ Correct
            </text>
          </g>

          {/* Rubric box (separate, not merged) */}
          <g transform="translate(580, 215)">
            <rect width="100" height="50" rx="6" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1" />
            <text x="50" y="20" textAnchor="middle" fontSize="9" fontWeight="600" fill="#2563eb">
              + Rubric
            </text>
            <text x="50" y="36" textAnchor="middle" fontSize="8" fill="#1d4ed8">
              (added separately)
            </text>
          </g>

          {/* Bottom success message */}
          <g transform="translate(30, 280)">
            <rect width="640" height="30" rx="6" fill="#f0fdf4" stroke="#86efac" />
            <text x="320" y="20" textAnchor="middle" fontSize="11" fill="#166534">
              Code defines what gets evaluated — LLM only judges the extracted, validated content
            </text>
          </g>
        </>
      )}
    </svg>
  );
}
