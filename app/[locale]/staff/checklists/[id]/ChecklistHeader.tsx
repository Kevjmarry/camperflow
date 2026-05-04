'use client';

type ChecklistHeaderProps = {
  title: string;
  statusLabel: string;
  contextLine: string;
};

export default function ChecklistHeader({
  title,
  statusLabel,
  contextLine,
}: ChecklistHeaderProps) {
  return (
    <div className="surface" style={{ borderRadius: '8px', padding: '16px', marginTop: '16px', marginBottom: '16px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 600,
              marginBottom: '4px',
              color: 'rgb(var(--text))',
            }}
          >
            {title}
          </h1>
          <p style={{ fontSize: '14px', color: 'rgb(var(--muted))' }}>{contextLine}</p>
        </div>

        <span
          style={{
            flexShrink: 0,
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            border: '1px solid rgb(var(--border))',
            backgroundColor: 'rgb(var(--surface))',
            color: 'rgb(var(--text))',
          }}
        >
          {statusLabel}
        </span>
      </div>
    </div>
  );
}
