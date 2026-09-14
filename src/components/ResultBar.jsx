export default function ResultBar({ total, query, matchType, loading, similarMode, onExitSimilar, activeCollection, selectedPerson, onExitPerson }) {
  const bar = (children) => (
    <div className="flex items-center gap-3 px-5 h-[38px] text-[11.5px] flex-shrink-0"
      style={{
        borderBottom: '1px solid var(--border-solid)',
        background: 'var(--bg)',
        color: 'var(--text-muted)',
      }}>
      {children}
    </div>
  )

  if (selectedPerson) {
    return bar(
      <>
        <button
          onClick={onExitPerson}
          className="flex items-center gap-1.5 font-semibold transition-all"
          style={{ color: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
          </svg>
          All Footage
        </button>
        <span style={{ color: 'var(--border-mid)' }}>·</span>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          👤 {selectedPerson.name || `Person ${selectedPerson.id}`}
        </span>
        <span style={{ color: 'var(--border-mid)' }}>·</span>
        <span>{total.toLocaleString()} {total === 1 ? 'clip' : 'clips'}</span>
      </>
    )
  }

  if (similarMode) {
    return bar(
      <>
        <button
          onClick={onExitSimilar}
          className="flex items-center gap-1.5 font-semibold transition-all"
          style={{ color: 'var(--accent)' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M5 12l7-7M5 12l7 7"/>
          </svg>
          Back
        </button>
        <span style={{ color: 'var(--border-mid)' }}>·</span>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {total.toLocaleString()} similar {total === 1 ? 'clip' : 'clips'}
        </span>
        <span className="ml-auto flex items-center gap-1.5" style={{ color: 'var(--text-dim)' }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 5px var(--accent)' }} />
          Visual similarity search
        </span>
      </>
    )
  }

  return bar(
    loading ? (
      <div className="flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
        <span className="w-3 h-3 rounded-full border-2 border-t-accent border-accent/20 animate-spin" />
        Searching…
      </div>
    ) : (
      <>
        {activeCollection && (
          <>
            <span className="text-base leading-none">{activeCollection.icon}</span>
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{activeCollection.name}</span>
            <span style={{ color: 'var(--border-mid)' }}>·</span>
          </>
        )}
        <span className="font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {total.toLocaleString()}
        </span>
        <span>{total === 1 ? 'clip' : 'clips'}</span>
        {query && (
          <>
            <span style={{ color: 'var(--border-mid)' }}>·</span>
            <span className="truncate max-w-[240px] font-medium" title={query} style={{ color: 'var(--text-muted)' }}>
              "{query}"
            </span>
          </>
        )}
        {matchType && matchType !== 'all' && matchType !== 'hybrid' && (
          <span className="ml-auto flex items-center gap-3" style={{ color: 'var(--text-dim)' }}>
            {(matchType === 'visual' || matchType === 'both') && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--match-visual)', boxShadow: '0 0 5px var(--match-visual)' }} />
                Visual
              </span>
            )}
            {(matchType === 'speech' || matchType === 'both') && (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--match-speech)', boxShadow: '0 0 5px var(--match-speech)' }} />
                Speech
              </span>
            )}
          </span>
        )}
        {!query && !activeCollection && (
          <span className="ml-auto text-[10.5px] font-medium" style={{ color: 'var(--text-dim)' }}>Most recent first</span>
        )}
      </>
    )
  )
}
