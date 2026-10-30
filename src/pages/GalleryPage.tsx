import { useMemo, useState } from 'react';

import { navigate } from '../app/router';
import { MiniPattern } from '../components/MiniPattern';
import { useToast } from '../components/Toast';
import { applyCuts } from '../geometry/cut';
import { getPreset } from '../geometry/fold';
import { downloadSvg } from '../services/export';
import {
  type ArtworkDoc,
  deleteArtwork,
  loadArtworks,
} from '../services/storage';

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}

function ArtCard({ doc, onChange }: { doc: ArtworkDoc; onChange: () => void }) {
  const { show, node } = useToast();
  const preset = getPreset(doc.foldPreset);
  const result = useMemo(() => applyCuts(doc.foldPreset, doc.cuts), [doc.foldPreset, doc.cuts]);

  return (
    <div className="art-card">
      <div className="art-thumb" style={{ background: doc.style.background }}>
        <MiniPattern paper={result.paper} color={doc.style.paper} label={`${doc.title} 图案`} />
      </div>
      <div className="art-meta">
        <strong>{doc.title}</strong>
        <span className="muted" style={{ fontSize: 12 }}>
          {preset.shortLabel} · {doc.cuts.length} 条切口 · {formatDate(doc.updatedAt)}
        </span>
        <span className={`chip ${doc.manufacturability === 'verified' ? 'chip--teal' : 'chip--gold'}`} style={{ marginTop: 4 }}>
          {doc.manufacturability === 'verified'
            ? '已核验实体模板'
            : doc.manufacturability === 'digital-only'
              ? '数字图案'
              : '未核验'}
        </span>
      </div>
      <div className="btn-row">
        <button className="btn btn--ghost btn--sm" onClick={() => navigate(`/studio/${doc.id}`)}>
          编辑
        </button>
        <button
          className="btn btn--quiet btn--sm"
          onClick={() => {
            const name = downloadSvg(result.paper, {
              paperColor: doc.style.paper,
              backgroundColor: doc.style.background,
              title: doc.title,
            });
            show(`已导出 ${name}`);
          }}
        >
          导出 SVG
        </button>
        <button
          className="btn btn--quiet btn--sm"
          onClick={() => {
            if (!window.confirm(`删除《${doc.title}》？此操作不可撤销。`)) return;
            const res = deleteArtwork(doc.id);
            if (!res.ok) {
              show(res.error ?? '删除失败');
              return;
            }
            show('已删除');
            onChange();
          }}
        >
          删除
        </button>
      </div>
      {node}
    </div>
  );
}

export function GalleryPage() {
  const [items, setItems] = useState<ArtworkDoc[]>(() => loadArtworks());
  const refresh = () => setItems(loadArtworks());

  return (
    <>
      <div className="head-row">
        <div>
          <div className="kicker">My works</div>
          <h1 className="level-title">我的作品</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            共 {items.length} 件 · 全部保存在你自己的浏览器里，不上传服务器。
          </p>
        </div>
        <div className="btn-row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn--primary btn--sm" onClick={() => navigate('/studio')}>
            去工坊创作
          </button>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        {items.length === 0 ? (
          <div className="empty">
            <p style={{ marginBottom: 12 }}>还没有保存的作品。</p>
            <button className="btn btn--ghost btn--sm" onClick={() => navigate('/studio')}>
              打开剪纸工坊，做一张
            </button>
          </div>
        ) : (
          <div className="gallery">
            {items.map((doc) => (
              <ArtCard key={doc.id} doc={doc} onChange={refresh} />
            ))}
          </div>
        )}
      </div>

      <p className="note" style={{ marginTop: 20 }}>
        提示：清除浏览器数据会一并删除本机作品。需要长期保存时，请用「导出 SVG / PNG」把图案下载到本地。
      </p>
    </>
  );
}
