'use client'

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

// ─── Font stack (Issue #2) ───────────────────────────────────────────────────
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif'

// ─── Shared text-wrap style (Issue #1, #6) ───────────────────────────────────
const TEXT_WRAP: React.CSSProperties = {
  wordBreak: 'break-word',
  overflowWrap: 'break-word',
  whiteSpace: 'pre-wrap',
  minWidth: 0,
}

export default function Home() {
  const [nodes, setNodes] = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [insight, setInsight] = useState('')

  // Inline field editing (next_action / delay_reason)
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // Card-level title / next_action edit modal (Issue #3)
  const [editingCard, setEditingCard] = useState<any | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editNext, setEditNext] = useState('')

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })

  useEffect(() => { fetchNodes(); fetchSnapshots() }, [])
  useEffect(() => { autoSnapshot() }, [nodes])

  // ── Data fetching ──────────────────────────────────────────────────────────

  async function fetchNodes() {
    const { data } = await supabase
      .from('nodes')
      .select('*')
      .order('created_at', { ascending: false })
    setNodes(data || [])
  }

  async function fetchSnapshots() {
    const { data } = await supabase
      .from('snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    setSnapshots(data || [])
    generateInsight(data || [])
  }

  // ── Node actions ───────────────────────────────────────────────────────────

  async function addNode() {
    if (!input.trim()) return
    await supabase.from('nodes').insert([{
      content: input,
      stage: 'idea',
      snapshot_created: false,
      next_action: '',
      delay_reason: '',
    }])
    setInput('')
    fetchNodes()
  }

  async function updateStage(node: any, nextStage: string) {
    const now = new Date().toISOString()
    const delayDays = calcDelayDays(node.updated_at)
    const dateStr = now.slice(0, 10)

    await supabase.from('nodes')
      .update({ stage: nextStage, updated_at: now })
      .eq('id', node.id)

    await supabase.from('snapshots').insert([{
      node_id: node.id,
      state: `[${dateStr}] "${node.content}" ${node.stage} → ${nextStage}`,
      criteria: node.delay_reason ? `reason: ${node.delay_reason}` : '자동 생성',
      progress: `delay: ${delayDays}일`,
      question: nextStage === 'done'
        ? '완료 처리됨'
        : `${nextStage} 전환 — 다음 행동은?`,
    }])

    await supabase.from('nodes')
      .update({ snapshot_created: false })
      .eq('id', node.id)

    fetchNodes()
    fetchSnapshots()
  }

  async function updateField(id: string, field: string, value: string) {
    await supabase.from('nodes')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id)
    setEditingField(null)
    setEditValue('')
    fetchNodes()
  }

  // Issue #3 – Edit card (title + next_action) without touching stage/timestamps
  async function saveCardEdit() {
    if (!editingCard) return
    await supabase.from('nodes')
      .update({ content: editTitle, next_action: editNext })
      .eq('id', editingCard.id)
    setEditingCard(null)
    fetchNodes()
  }

  // Issue #4 – Discard (reversible: moves to 'discarded' stage)
  async function discardNode(node: any) {
    await supabase.from('nodes')
      .update({ stage: 'discarded', updated_at: new Date().toISOString() })
      .eq('id', node.id)
    fetchNodes()
  }

  async function restoreNode(node: any) {
    await supabase.from('nodes')
      .update({ stage: 'idea', updated_at: new Date().toISOString() })
      .eq('id', node.id)
    fetchNodes()
  }

  async function createNodeFromSnapshot(s: any) {
    await supabase.from('nodes').insert([{
      content: `[From Snapshot] ${s.question}`,   // Issue #5 – removed \n to prevent broken title
      stage: 'doing',                              // Issue #5 – restore to 'doing' not 'focus'
      snapshot_created: false,
      next_action: '',
      delay_reason: '',
    }])
    fetchNodes()
  }

  async function autoSnapshot() {
    const now = Date.now()
    const threshold = 48 * 60 * 60 * 1000
    const targets = nodes.filter(n =>
      n.stage === 'doing' && !n.snapshot_created &&
      now - new Date(n.updated_at).getTime() > threshold
    )
    for (const node of targets) {
      await supabase.from('snapshots').insert([{
        node_id: node.id,
        state: node.content,
        criteria: '자동 생성',
        progress: '48시간 진행 없음',
        question: '이 작업을 계속해야 하는가?',
      }])
      await supabase.from('nodes').update({ snapshot_created: true }).eq('id', node.id)
    }
    if (targets.length > 0) fetchSnapshots()
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function calcDelayDays(updatedAt: string) {
    if (!updatedAt) return 0
    return Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000)
  }

  function formatDate(iso: string) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  function generateInsight(data: any[]) {
    if (data.length < 3) return
    if (data.filter(s => s.progress?.includes('진행 없음')).length >= 3)
      setInsight('최근 반복적으로 진행이 멈추고 있음 → 실행 지속성 문제 가능성')
  }

  // ── Stage config ───────────────────────────────────────────────────────────

  const stageConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    idea:      { label: 'IDEA',      color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
    focus:     { label: 'FOCUS',     color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
    doing:     { label: 'DOING',     color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
    done:      { label: 'DONE',      color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
    discarded: { label: 'DISCARDED', color: '#9CA3AF', bg: '#F3F4F6', border: '#D1D5DB' },
  }

  // ── NodeCard ───────────────────────────────────────────────────────────────

  function NodeCard({ node }: { node: any }) {
    // Issue #5 – always fall back to stageConfig.idea so unknown stages don't crash
    const cfg = stageConfig[node.stage] ?? stageConfig.idea
    const isEditingNext   = editingField?.id === node.id && editingField.field === 'next_action'
    const isEditingReason = editingField?.id === node.id && editingField.field === 'delay_reason'

    return (
      <div
        style={{
          background: cfg.bg,
          border: `1px solid ${cfg.border}`,
          borderRadius: '12px',
          padding: '14px 16px',
          marginBottom: '10px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          transition: 'box-shadow 0.15s',
          // Issue #6 – fixed width; never expand horizontally
          width: '100%',
          boxSizing: 'border-box',
          minWidth: 0,
          maxWidth: '100%',
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
      >
        {/* Stage badge */}
        <div style={{ marginBottom: '8px' }}>
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em',
            color: cfg.color, background: 'white',
            border: `1px solid ${cfg.border}`, borderRadius: '20px', padding: '2px 8px',
          }}>{cfg.label}</span>
        </div>

        {/* Title (Issue #1, #6 – word-break + pre-wrap) */}
        <p style={{
          fontWeight: 600, fontSize: '14px', color: '#111827',
          lineHeight: 1.5, marginBottom: '8px',
          ...TEXT_WRAP,
        }}>
          {node.content}
        </p>

        {/* next_action */}
        {isEditingNext ? (
          <input
            autoFocus
            style={{
              width: '100%', fontSize: '12px', padding: '4px 8px',
              border: '1px solid #D1D5DB', borderRadius: '6px',
              background: 'white', marginBottom: '6px', outline: 'none',
              boxSizing: 'border-box',          // Issue #6
              fontFamily: FONT_FAMILY,           // Issue #2
            }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') updateField(node.id, 'next_action', editValue)
              if (e.key === 'Escape') setEditingField(null)
            }}
            onBlur={() => updateField(node.id, 'next_action', editValue)}
            placeholder="다음 행동 입력..."
          />
        ) : (
          <p
            style={{
              fontSize: '12px', color: '#6B7280', marginBottom: '6px',
              cursor: 'pointer', minHeight: '18px',
              borderBottom: '1px dashed transparent',
              ...TEXT_WRAP,                        // Issue #1 – display consistent with input
            }}
            onMouseEnter={e => (e.currentTarget.style.borderBottomColor = '#D1D5DB')}
            onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
            onClick={() => {
              setEditingField({ id: node.id, field: 'next_action' })
              setEditValue(node.next_action || '')
            }}
          >
            {node.next_action
              ? `→ ${node.next_action}`
              : <span style={{ color: '#D1D5DB' }}>+ 다음 행동</span>}
          </p>
        )}

        {/* delay_reason */}
        {isEditingReason ? (
          <input
            autoFocus
            style={{
              width: '100%', fontSize: '11px', padding: '3px 8px',
              border: '1px solid #FCA5A5', borderRadius: '6px',
              background: 'white', marginBottom: '6px', outline: 'none',
              color: '#B91C1C', boxSizing: 'border-box',
              fontFamily: FONT_FAMILY,
            }}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') updateField(node.id, 'delay_reason', editValue)
              if (e.key === 'Escape') setEditingField(null)
            }}
            onBlur={() => updateField(node.id, 'delay_reason', editValue)}
            placeholder="지연 이유 입력..."
          />
        ) : node.delay_reason ? (
          <p
            style={{ fontSize: '11px', color: '#DC2626', marginBottom: '6px', cursor: 'pointer', ...TEXT_WRAP }}
            onClick={() => { setEditingField({ id: node.id, field: 'delay_reason' }); setEditValue(node.delay_reason) }}
          >⚠ {node.delay_reason}</p>
        ) : (
          <p
            style={{ fontSize: '11px', color: '#FCA5A5', marginBottom: '6px', cursor: 'pointer', minHeight: '16px' }}
            onClick={() => { setEditingField({ id: node.id, field: 'delay_reason' }); setEditValue('') }}
          >
            <span style={{ color: '#FEE2E2' }}>+ 지연 이유</span>
          </p>
        )}

        {/* Timestamps */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: '#9CA3AF' }}>생성 {formatDate(node.created_at)}</span>
          {node.updated_at && node.updated_at !== node.created_at && (
            <span style={{ fontSize: '10px', color: '#9CA3AF' }}>수정 {formatDate(node.updated_at)}</span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>

          {/* Stage transitions — Issue #5: done cards show focus + doing */}
          {node.stage !== 'focus' && node.stage !== 'done' && node.stage !== 'discarded' && (
            <Btn label="focus" border="#FDE68A" bg="#FFFBEB" color="#92400E"
              onClick={() => updateStage(node, 'focus')} />
          )}
          {node.stage !== 'doing' && node.stage !== 'done' && node.stage !== 'discarded' && (
            <Btn label="doing" border="#BFDBFE" bg="#EFF6FF" color="#1E40AF"
              onClick={() => updateStage(node, 'doing')} />
          )}
          {node.stage !== 'done' && node.stage !== 'discarded' && (
            <Btn label="done" border="#BBF7D0" bg="#F0FDF4" color="#166534"
              onClick={() => updateStage(node, 'done')} />
          )}

          {/* Issue #5 – done → restore shows focus / doing buttons */}
          {node.stage === 'done' && (
            <>
              <Btn label="↩ focus" border="#FDE68A" bg="#FFFBEB" color="#92400E"
                onClick={() => updateStage(node, 'focus')} />
              <Btn label="↩ doing" border="#BFDBFE" bg="#EFF6FF" color="#1E40AF"
                onClick={() => updateStage(node, 'doing')} />
            </>
          )}

          {/* Issue #3 – Edit button */}
          {node.stage !== 'discarded' && (
            <Btn label="✎ 편집" border="#E5E7EB" bg="#F9FAFB" color="#374151"
              onClick={() => {
                setEditingCard(node)
                setEditTitle(node.content)
                setEditNext(node.next_action || '')
              }} />
          )}

          {/* Issue #4 – Discard / Restore */}
          {node.stage !== 'discarded' ? (
            <Btn label="✕ 폐기" border="#FCA5A5" bg="#FFF5F5" color="#DC2626"
              onClick={() => discardNode(node)} />
          ) : (
            <Btn label="↩ 복원" border="#E5E7EB" bg="#F9FAFB" color="#6B7280"
              onClick={() => restoreNode(node)} />
          )}
        </div>
      </div>
    )
  }

  // ── Reusable small button ──────────────────────────────────────────────────

  function Btn({ label, border, bg, color, onClick }: {
    label: string; border: string; bg: string; color: string; onClick: () => void
  }) {
    return (
      <button onClick={onClick} style={{
        fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
        border: `1px solid ${border}`, background: bg, color,
        cursor: 'pointer', fontWeight: 500, fontFamily: FONT_FAMILY,
        whiteSpace: 'nowrap',
      }}>{label}</button>
    )
  }

  // ── Edit modal (Issue #3) ──────────────────────────────────────────────────

  function EditModal() {
    if (!editingCard) return null
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
      }}
        onClick={e => { if (e.target === e.currentTarget) setEditingCard(null) }}
      >
        <div style={{
          background: 'white', borderRadius: '14px', padding: '24px',
          width: '420px', maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          fontFamily: FONT_FAMILY,
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#111827', marginBottom: '16px' }}>카드 편집</h3>

          <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>제목</label>
          <textarea
            rows={3}
            style={{
              width: '100%', fontSize: '13px', padding: '8px 10px',
              border: '1px solid #E5E7EB', borderRadius: '8px',
              resize: 'vertical', outline: 'none', marginBottom: '12px',
              fontFamily: FONT_FAMILY, boxSizing: 'border-box',
              ...TEXT_WRAP,
            }}
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
          />

          <label style={{ fontSize: '12px', color: '#6B7280', display: 'block', marginBottom: '4px' }}>다음 행동</label>
          <input
            style={{
              width: '100%', fontSize: '13px', padding: '8px 10px',
              border: '1px solid #E5E7EB', borderRadius: '8px',
              outline: 'none', marginBottom: '20px',
              fontFamily: FONT_FAMILY, boxSizing: 'border-box',
            }}
            value={editNext}
            onChange={e => setEditNext(e.target.value)}
            placeholder="다음 행동 입력..."
          />

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Btn label="취소" border="#E5E7EB" bg="#F9FAFB" color="#6B7280"
              onClick={() => setEditingCard(null)} />
            <button onClick={saveCardEdit} style={{
              fontSize: '12px', padding: '6px 16px', borderRadius: '8px',
              background: '#1E40AF', color: 'white', border: 'none',
              cursor: 'pointer', fontWeight: 600, fontFamily: FONT_FAMILY,
            }}>저장</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Layout ─────────────────────────────────────────────────────────────────

  const activeStages = ['idea', 'focus', 'doing'] as const
  const discardedNodes = nodes.filter(n => n.stage === 'discarded')

  return (
    <div style={{
      padding: '28px 32px', maxWidth: '1200px', margin: '0 auto',
      fontFamily: FONT_FAMILY,                   // Issue #2
    }}>

      <EditModal />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '2px' }}>Flow OS</h1>
          <p style={{ fontSize: '12px', color: '#9CA3AF' }}>{today}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {activeStages.map(s => {
            const count = nodes.filter(n => n.stage === s).length
            const cfg = stageConfig[s]
            return (
              <span key={s} style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                borderRadius: '20px', background: cfg.bg, color: cfg.color,
                border: `1px solid ${cfg.border}`,
              }}>{s} {count}</span>
            )
          })}
        </div>
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
        <input
          style={{
            flex: 1, padding: '10px 14px', fontSize: '14px',
            border: '1px solid #E5E7EB', borderRadius: '10px',
            outline: 'none', background: '#FAFAFA', color: '#111827',
            fontFamily: FONT_FAMILY,               // Issue #2
            minWidth: 0,                            // Issue #6 – prevent flex overflow
          }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNode()}
          placeholder="생각 입력 → Enter (idea로 저장)"
          onFocus={e => (e.target.style.borderColor = '#93C5FD')}
          onBlur={e => (e.target.style.borderColor = '#E5E7EB')}
        />
        <button onClick={addNode} style={{
          padding: '10px 18px', fontSize: '13px', fontWeight: 600,
          background: '#1E40AF', color: 'white', border: 'none',
          borderRadius: '10px', cursor: 'pointer', fontFamily: FONT_FAMILY,
          whiteSpace: 'nowrap',
        }}>+ 추가</button>
      </div>

      {/* Insight */}
      {insight && (
        <div style={{
          background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px',
          padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#1E40AF',
        }}>💡 {insight}</div>
      )}

      {/* Board — Issue #6: minWidth:0 on each column prevents grid blowout */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '20px', marginBottom: '36px',
        // Prevent columns from exceeding their track width
        overflow: 'hidden',
      }}>
        {activeStages.map(stage => {
          const cfg = stageConfig[stage]
          const stageNodes = nodes.filter(n => n.stage === stage)
          return (
            <div key={stage} style={{ minWidth: 0 }}> {/* Issue #6 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: cfg.color,
                }}>{stage}</span>
                <span style={{
                  fontSize: '10px', color: cfg.color, background: cfg.bg,
                  border: `1px solid ${cfg.border}`, borderRadius: '20px', padding: '1px 7px',
                }}>{stageNodes.length}</span>
              </div>
              {stageNodes.map(n => <NodeCard key={n.id} node={n} />)}
              {stageNodes.length === 0 && (
                <div style={{
                  border: '1px dashed #E5E7EB', borderRadius: '12px',
                  padding: '20px', textAlign: 'center',
                  fontSize: '12px', color: '#D1D5DB',
                }}>비어 있음</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Issue #4 – Discarded section */}
      {discardedNodes.length > 0 && (
        <div style={{ marginBottom: '36px' }}>
          <h2 style={{
            fontSize: '13px', fontWeight: 700, color: '#9CA3AF',
            letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px',
          }}>폐기됨</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {discardedNodes.map(n => <NodeCard key={n.id} node={n} />)}
          </div>
        </div>
      )}

      {/* Snapshots */}
      <div>
        <h2 style={{
          fontSize: '13px', fontWeight: 700, color: '#6B7280',
          letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px',
        }}>snapshots</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {snapshots.map(s => (
            <div key={s.id} style={{
              background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '10px',
              padding: '12px 14px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontSize: '12px', color: '#374151', fontWeight: 500, marginBottom: '2px', ...TEXT_WRAP }}>{s.state}</p>
                <p style={{ fontSize: '11px', color: '#9CA3AF' }}>{s.progress} · {s.criteria}</p>
                <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>Q: {s.question}</p>
              </div>
              <button
                onClick={() => createNodeFromSnapshot(s)}
                style={{
                  fontSize: '11px', padding: '4px 10px', borderRadius: '6px', whiteSpace: 'nowrap',
                  border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1E40AF',
                  cursor: 'pointer', fontWeight: 500, marginLeft: '12px', flexShrink: 0,
                  fontFamily: FONT_FAMILY,
                }}
              >↩ 다시 실행</button>
            </div>
          ))}
          {snapshots.length === 0 && (
            <p style={{ fontSize: '12px', color: '#D1D5DB' }}>스냅샷 없음</p>
          )}
        </div>
      </div>
    </div>
  )
}
