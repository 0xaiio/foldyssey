import { useMemo, useRef, useState } from 'react';

import { generateDesign, remainingQuota, type AiFailure, type AiSuccess } from '../ai/client';
import { AI_DISCLOSURE } from '../ai/cloudConfig';
import { saveAiDraft } from '../ai/draft';
import { describeDesign } from '../ai/schema';
import { AI_TEMPLATES, type AiTemplate } from '../ai/templates';
import { navigate } from '../app/router';
import { PaperStage } from '../components/PaperStage';
import { useToast } from '../components/Toast';
import { applyCuts } from '../geometry/cut';
import { getPreset } from '../geometry/fold';
import { formatPercent } from '../geometry/score';
import { downloadSvg } from '../services/export';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function AiPage() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<AiSuccess | null>(null);
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [quota, setQuota] = useState(() => remainingQuota());
  const { show: toast, node: toastNode } = useToast();
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // Derived, not stored: as soon as the user edits the brief, no chip is
  // "current" any more — no extra state to keep in sync.
  const activeLabel = AI_TEMPLATES.find((t) => t.prompt === prompt)?.label ?? null;

  const applyTemplate = (t: AiTemplate) => {
    setPrompt(t.prompt);
    // Put the caret at the end and focus, so the next keystroke edits the brief
    // instead of the user having to click into the box first.
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(t.prompt.length, t.prompt.length);
    });
  };

  const preview = useMemo(() => {
    if (!result) return null;
    return applyCuts(result.design.foldPreset, result.cuts);
  }, [result]);

  const run = async (text: string) => {
    setStatus('loading');
    setFailure(null);
    const res = await generateDesign(text);
    setQuota(remainingQuota());
    if (res.ok) {
      setResult(res);
      setStatus('success');
    } else {
      setFailure(res.failure);
      setStatus('error');
    }
  };

  const openInStudio = () => {
    if (!result) return;
    saveAiDraft({
      foldPreset: result.design.foldPreset,
      cuts: result.cuts,
      style: { paper: result.design.palette.paper, background: result.design.palette.background },
      title: result.design.title,
    });
    navigate('/studio');
  };

  return (
    <>
      <div className="head-row">
        <div>
          <div className="kicker">AI Design Companion</div>
          <h1 className="level-title">AI 灵感设计师</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            用一句话描述你想要的剪纸。模型只负责挑选<strong>受约束的设计参数</strong>，
            真正的图案由本机几何引擎计算——所以每一张都能编辑、能导出、能被验证。
          </p>
        </div>
        <div className="btn-row" style={{ marginLeft: 'auto' }}>
          <span className="chip chip--teal">运行时模型已接入</span>
          <span className="chip">无需 API Key</span>
        </div>
      </div>

      <div className="ai-grid">
        <section className="card card--pad">
          <div className="panel-title">
            <h3>描述你的主题</h3>
            <span>≤ 120 字</span>
          </div>

          <textarea
            ref={areaRef}
            className="prompt-input"
            value={prompt}
            maxLength={120}
            rows={4}
            placeholder="例如：喜庆的八瓣红色窗花，适合春节挂窗"
            aria-label="描述你想要的剪纸主题"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && status !== 'loading') {
                void run(prompt);
              }
            }}
          />
          <div className="prompt-meta">
            <span className="muted">{prompt.length} / 120</span>
            <span className="muted">Ctrl / ⌘ + Enter 生成</span>
          </div>

          <div className="example-chips" role="group" aria-label="示例模板">
            {AI_TEMPLATES.map((t) => {
              const active = activeLabel === t.label;
              return (
                <button
                  key={t.label}
                  type="button"
                  className={`example-chip${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => applyTemplate(t)}
                >
                  <span className="example-chip__label">{t.label}</span>
                  <span className="example-chip__hint">{t.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="note example-note">
            点模板会把一段<strong>可直接修改</strong>的完整描述填进输入框（含折数、元素、配色、用途），
            你可以在它的基础上改字、加词。
          </p>

          <div className="btn-row" style={{ marginTop: 14 }}>
            <button
              className="btn btn--primary"
              onClick={() => void run(prompt)}
              disabled={status === 'loading' || prompt.trim().length < 4}
            >
              {status === 'loading' ? '正在生成…' : '生成设计'}
            </button>
            <button className="btn btn--quiet btn--sm" onClick={() => setPrompt('')} disabled={!prompt}>
              清空
            </button>
          </div>

          <p className="note" style={{ marginTop: 12 }}>
            {AI_DISCLOSURE}
          </p>
          <p className="note" style={{ marginTop: 6 }}>
            本机限制：两次生成间隔 5 秒，每个会话最多 12 次（剩余 {quota} 次）。
          </p>

          {status === 'loading' && (
            <div className="ai-loading" role="status" aria-live="polite">
              <span className="ai-dot" />
              <span className="ai-dot" />
              <span className="ai-dot" />
              <span>模型正在挑选折叠方式与切线参数…</span>
            </div>
          )}

          {status === 'error' && failure && (
            <div className="ai-error" role="alert">
              <strong>{failure.kind === 'rate' ? '先歇一下' : '这次没有成功'}</strong>
              <p>{failure.message}</p>
              {failure.detail && (
                <details className="ai-error__detail">
                  <summary>技术细节</summary>
                  <code>{failure.detail}</code>
                </details>
              )}
              <div className="btn-row" style={{ marginTop: 10 }}>
                {failure.retryable && (
                  <button className="btn btn--ghost btn--sm" onClick={() => void run(prompt)}>
                    重试
                  </button>
                )}
                <button
                  className="btn btn--quiet btn--sm"
                  onClick={() => {
                    toast('已打开工坊，可以先从预设图案开始。');
                    navigate('/studio');
                  }}
                >
                  改用预设模板
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card card--pad">
          <div className="panel-title">
            <h3>生成结果</h3>
            <span>{result ? result.modelId : '实时渲染'}</span>
          </div>

          {!result || !preview ? (
            <div className="ai-empty">
              <div className="ai-empty__mark" aria-hidden="true">
                ✂
              </div>
              <p>
                生成的图案会在这里实时渲染。
                <br />
                它来自几何运算，不是图片。
              </p>
            </div>
          ) : (
            <div className="reveal">
              <div
                className="ai-preview"
                style={{ background: result.design.palette.background }}
              >
                <PaperStage
                  preset={getPreset(result.design.foldPreset)}
                  outcome={preview}
                  foldedness={0}
                  paperColor={result.design.palette.paper}
                  accentColor="#D84A49"
                  showCreases={false}
                  noZoom
                  ariaLabel={`${result.design.title}：AI 参数生成的剪纸图案`}
                />
              </div>

              <h3 className="h3" style={{ marginTop: 12 }}>
                {result.design.title}
              </h3>
              <p className="note" style={{ marginTop: 4 }}>
                {result.design.note}
              </p>

              <div className="ai-chips">
                <span className="chip">{describeDesign(result.design)}</span>
                <span className="chip chip--gold">保留 {formatPercent(result.keepRatio, 0)}</span>
                {result.design.cutCount > 0 && (
                  <span className="chip chip--red">{result.design.structure.petal > 0 ? '含花瓣' : '纯直线'}</span>
                )}
                {result.attempt > 1 && <span className="chip">重试后成功</span>}
                <span className="chip">{result.elapsedMs} ms</span>
              </div>

              {result.warnings.length > 0 && (
                <div className="ai-warn">
                  {result.warnings.slice(0, 6).map((w) => (
                    <div key={w}>· {w}</div>
                  ))}
                </div>
              )}

              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn btn--primary btn--sm" onClick={openInStudio}>
                  在工坊中打开
                </button>
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    const name = downloadSvg(result.paper, {
                      paperColor: result.design.palette.paper,
                      backgroundColor: result.design.palette.background,
                      title: result.design.title,
                    });
                    toast(`已导出 ${name}`);
                  }}
                >
                  导出 SVG
                </button>
                <button
                  className="btn btn--quiet btn--sm"
                  onClick={() => void run(prompt)}
                >
                  再生成一张
                </button>
              </div>

              <p className="note" style={{ marginTop: 10 }}>
                模型只给出参数建议（折叠阶数、元素类型、尺寸、配色）；路径、孔洞与面积由
                <code> src/geometry</code> 计算。越界数值会被收进合法范围，写错的枚举会按语义映射，
                无法实现的结构会被替换成该主题的默认层次——所以这里几乎不会出现“参数不合法”。
              </p>
            </div>
          )}
        </section>
      </div>

      <p className="note" style={{ marginTop: 18, maxWidth: 760 }}>
        说明：这里生成的是<strong>数字图案</strong>，不是经过核验的实体折剪模板。
        八折（D4）下的花瓣与镂空在真实折剪中都能剪出，但本版没有提供可打印的折序与比例尺。
      </p>
      {toastNode}
    </>
  );
}
