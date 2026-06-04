import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function SentimentBadge({ score }) {
  if (score == null) return <span className="sentiment-badge neutral">⚪ Neutral</span>;
  if (score >= 0.05) return (
    <span className="sentiment-badge positive">
      🟢 Positive
    </span>
  );
  if (score <= -0.05) return (
    <span className="sentiment-badge negative">
      🔴 Negative
    </span>
  );
  return <span className="sentiment-badge neutral">⚪ Neutral</span>;
}

function OverallSentiment({ newsItems }) {
  if (!newsItems || newsItems.length === 0) return null;

  const scored = newsItems.filter((n) => n.sentiment_score != null);
  if (scored.length === 0) return null;

  const avg = scored.reduce((sum, n) => sum + (n.sentiment_score ?? 0), 0) / scored.length;
  const pct = ((avg + 1) / 2 * 100).toFixed(0); // normalize -1..1 to 0..100

  const label = avg >= 0.15 ? 'Bullish' : avg >= 0.05 ? 'Slightly Bullish' : avg <= -0.15 ? 'Bearish' : avg <= -0.05 ? 'Slightly Bearish' : 'Neutral';
  const color = avg >= 0.05 ? 'var(--accent)' : avg <= -0.05 ? 'var(--danger)' : 'var(--text-muted)';

  return (
    <div className="news-overall">
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 4 }}>
          Portfolio Sentiment Score
        </div>
        <div className="news-sentiment-score" style={{ color }}>
          {avg >= 0 ? '+' : ''}{avg.toFixed(3)}
        </div>
        <div className="news-sentiment-label">{label}</div>
      </div>
      <div style={{ flex: 1, padding: '0 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--text-faint)' }}>
          <span>Bearish</span><span>Neutral</span><span>Bullish</span>
        </div>
        <div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute',
            left: '50%',
            width: '1px',
            top: 0, bottom: 0,
            background: 'var(--border-light)',
          }} />
          <div style={{
            width: `${pct}%`,
            height: '100%',
            background: `linear-gradient(to right, var(--danger), var(--text-muted) 50%, var(--accent))`,
            borderRadius: 4,
            transition: 'width 0.6s ease',
          }} />
        </div>
        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 11, color: 'var(--text-faint)' }}>
          Based on {scored.length} article{scored.length !== 1 ? 's' : ''}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Breakdown</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>
              {newsItems.filter((n) => (n.sentiment_score ?? 0) >= 0.05).length}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Positive</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontWeight: 600 }}>
              {newsItems.filter((n) => Math.abs(n.sentiment_score ?? 0) < 0.05).length}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Neutral</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--danger)', fontWeight: 600 }}>
              {newsItems.filter((n) => (n.sentiment_score ?? 0) <= -0.05).length}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Negative</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewsItemSkeleton() {
  return (
    <div className="news-item">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="skeleton" style={{ height: 14, width: '85%' }} />
        <div className="skeleton" style={{ height: 14, width: '65%' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <div className="skeleton" style={{ height: 12, width: 80 }} />
          <div className="skeleton" style={{ height: 12, width: 60 }} />
          <div className="skeleton" style={{ height: 18, width: 70, borderRadius: 20 }} />
        </div>
      </div>
    </div>
  );
}

export default function NewsPanel({ token, portfolioId }) {
  const [newsData, setNewsData]  = useState(null);
  const [loading, setLoading]    = useState(false);
  const [error, setError]        = useState('');

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getNews(token, portfolioId);
      setNewsData(data);
    } catch (err) {
      setError(err.message || 'Failed to load news');
    } finally {
      setLoading(false);
    }
  }, [token, portfolioId]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  // Backend returns a flat array of NewsItem objects — group by symbol client-side
  const groupedMap = {};
  if (Array.isArray(newsData)) {
    for (const item of newsData) {
      const sym = item.symbol || 'Unknown';
      if (!groupedMap[sym]) groupedMap[sym] = [];
      groupedMap[sym].push(item);
    }
  }

  // Flatten all articles for overall sentiment
  const allArticles = Object.values(groupedMap).flat();

  // Group entries for rendering
  const groups = Object.entries(groupedMap);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="refresh-btn" onClick={fetchNews} disabled={loading}>
          {loading ? <span className="spinner" /> : '🔄'} Refresh
        </button>
      </div>

      {/* Overall sentiment */}
      {!loading && allArticles.length > 0 && (
        <OverallSentiment newsItems={allArticles} />
      )}

      {/* Error */}
      {error && (
        <div className="auth-error" style={{ marginTop: 0 }}>{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="news-group">
          <div className="news-group-header">
            <div className="skeleton" style={{ height: 14, width: 80 }} />
          </div>
          {[...Array(4)].map((_, i) => <NewsItemSkeleton key={i} />)}
        </div>
      )}

      {/* No news */}
      {!loading && !error && allArticles.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📰</div>
          <div className="empty-title">No News Available</div>
          <div className="empty-desc">Add holdings to your portfolio to see relevant news and sentiment analysis.</div>
        </div>
      )}

      {/* News groups by symbol */}
      {!loading && groups.map(([symbol, articles]) => {
        if (!articles || articles.length === 0) return null;
        const symbolAvg = articles.reduce((s, a) => s + (a.sentiment_score ?? 0), 0) / articles.length;
        const symbolSentColor = symbolAvg >= 0.05 ? 'var(--accent)' : symbolAvg <= -0.05 ? 'var(--danger)' : 'var(--text-muted)';

        return (
          <div key={symbol} className="news-group">
            <div className="news-group-header">
              <span className="news-group-symbol">{symbol}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {articles.length} article{articles.length !== 1 ? 's' : ''}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: symbolSentColor, fontWeight: 600 }}>
                Avg: {symbolAvg >= 0 ? '+' : ''}{symbolAvg.toFixed(3)}
              </span>
            </div>

            {articles.map((article, idx) => (
              <div key={idx} className="news-item">
                <div className="news-item-body">
                  <div className="news-headline">
                    {article.url ? (
                      <a href={article.url} target="_blank" rel="noopener noreferrer">
                        {article.headline || 'Untitled'}
                      </a>
                    ) : (
                      article.headline || 'Untitled'
                    )}
                  </div>
                  <div className="news-meta">
                    {article.source && (
                      <span className="news-source">📰 {article.source}</span>
                    )}
                    {(article.published_at || article.publishedAt) && (
                      <span className="news-date">
                        🕐 {timeAgo(article.published_at || article.publishedAt)}
                      </span>
                    )}
                    <SentimentBadge score={article.sentiment_score} />
                    {article.sentiment_score != null && (
                      <span className="vader-score">
                        score: {article.sentiment_score >= 0 ? '+' : ''}{article.sentiment_score.toFixed(3)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
