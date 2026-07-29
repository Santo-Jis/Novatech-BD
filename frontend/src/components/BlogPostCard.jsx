import { useNavigate } from 'react-router-dom'
import { VISUALS, BrandVisualPanel } from './BrandVisuals'

// ============================================================
// BlogPostCard — Blog.jsx (লিস্ট) ও BlogPost.jsx (রিলেটেড পোস্ট) দুটোতেই
// পুনঃব্যবহারযোগ্য কার্ড। নতুন কোথাও ব্লগ কার্ড দরকার হলে এটাই ব্যবহার করুন।
// ============================================================

const T = {
  bgSurface: '#FFFFFF',
  primary700: '#16253D',
  accent600: '#9C6B2E',
  accent100: '#F3E6D0',
  textSecondary: '#5B6472',
  textMuted: '#8B8F98',
  borderDefault: '#E4E1D8',
  fontHead: "'Source Serif 4','Noto Sans Bengali',Georgia,serif",
  fontBody: "'IBM Plex Sans','Noto Sans Bengali',Arial,sans-serif",
  fontMono: "'IBM Plex Mono',monospace",
}

export default function BlogPostCard({ post }) {
  const navigate = useNavigate()
  const visual = VISUALS.find((v) => v.id === post.visualId) || VISUALS[0]

  return (
    <div
      onClick={() => navigate(`/blog/${post.slug}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/blog/${post.slug}`) }}
      style={{
        cursor: 'pointer',
        background: T.bgSurface,
        border: `1px solid ${T.borderDefault}`,
        borderRadius: '14px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 14px 30px rgba(15,27,46,0.12)' }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none' }}
    >
      <div style={{ height: '150px', flexShrink: 0 }}>
        <BrandVisualPanel visual={visual} compact />
      </div>
      <div style={{ padding: '18px 18px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <span
          style={{
            display: 'inline-block', alignSelf: 'flex-start', padding: '3px 10px',
            background: T.accent100, color: T.accent600, borderRadius: '20px',
            fontSize: '11px', fontWeight: 700, fontFamily: T.fontMono, letterSpacing: '0.03em',
            marginBottom: '10px',
          }}
        >
          {post.category}
        </span>
        <h3 style={{ fontFamily: T.fontHead, fontSize: '16px', fontWeight: 600, color: T.primary700, margin: '0 0 8px', lineHeight: 1.4 }}>
          {post.title}
        </h3>
        <p style={{ fontSize: '13px', color: T.textSecondary, lineHeight: 1.6, margin: '0 0 14px', flex: 1, fontFamily: T.fontBody }}>
          {post.excerpt}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: T.textMuted, fontFamily: T.fontMono }}>
          <span>{post.date}</span>
          <span>{post.readTime}</span>
        </div>
      </div>
    </div>
  )
}
