'use client'

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function Home() {
  const [nodes, setNodes] = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [insight, setInsight] = useState('')
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  })

  useEffect(() => {
    fetchNodes()
    fetchSnapshots()
  }, [])

  useEffect(() => {
    autoSnapshot()
  }, [nodes])

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

  async function addNode() {
    if (!input.trim()) return
    await supabase.from('nodes').insert([
      {
        content: input,
        stage: 'idea',
        snapshot_created: false,
        next_action: '',
        delay_reason: ''
      }
    ])
    setInput('')
    fetchNodes()
  }

  function calcDelayDays(updatedAt: string): number {
    if (!updatedAt) return 0
    const diff = Date.now() - new Date(updatedAt).getTime()
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('ko-KR', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  async function updateStage(node: any, nextStage: string) {
    const now = new Date().toISOString()
    const delayDays = calcDelayDays(node.updated_at)
    const dateStr = now.slice(0, 10)

    await supabase
      .from('nodes')
      .update({ stage: nextStage, updated_at: now })
      .eq('id', node.id)

    const snapshotState = `[${dateStr}] "${node.content}" ${node.stage} → ${nextStage}`
    const snapshotProgress = `delay: ${delayDays}일`
    const snapshotCriteria = node.delay_reason ? `reason: ${node.delay_reason}` : '자동 생성'
    const snapshotQuestion = `${nextStage === 'done' ? '완료 처리됨' : `${nextStage} 전환 — 다음 행동은?`}`

    await supabase.from('snapshots').insert([
      {
        node_id: node.id,
        state: snapshotState,
        criteria: snapshotCriteria,
        progress: snapshotProgress,
        question: snapshotQuestion
      }
    ])

    await supabase
      .from('nodes')
      .update({ snapshot_created: false })
      .eq('id', node.id)

    fetchNodes()
    fetchSnapshots()
  }

  async function updateField(id: string, field: string, value: string) {
    await supabase
      .from('nodes')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id)
    setEditingField(null)
    setEditValue('')
    fetchNodes()
  }

  async function createNodeFromSnapshot(s: any) {
    await supabase.from('nodes').insert([
      {
        content: `[From Snapshot]\n${s.question}`,
        stage: 'focus',
        snapshot_created: false,
        next_action: '',
        delay_reason: ''
      }
    ])
    fetchNodes()
  }

  async function autoSnapshot() {
    const now = Date.now()
    const threshold = 48 * 60 * 60 * 1000

    const targets = nodes.filter(n => {
      if (n.stage !== 'doing') return false
      if (n.snapshot_created) return false
      const updated = new Date(n.updated_at).getTime()
      return now - updated > threshold
    })

    for (const node of targets) {
      await supabase.from('snapshots').insert([
        {
          node_id: node.id,
          state: node.content,
          criteria: '자동 생성',
          progress: '48시간 진행 없음',
          question: '이 작업을 계속해야 하는가?'
        }
      ])
      await supabase
        .from('nodes')
        .update({ snapshot_created: true })
        .eq('id', node.id)
    }

    if (targets.length > 0) {
      fetchSnapshots()
    }
  }

  function generateInsight(data: any[]) {
    if (data.length < 3) return
    const stuckCount = data.filter(s => s.progress?.includes('진행 없음')).length
    if (stuckCount >= 3) {
      setInsight('최근 반복적으로 진행이 멈추고 있음 → 실행 지속성 문제 가능성')
    }
  }

  const stageConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
    idea:  { label: 'idea',  color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
    focus: { label: 'focus', color: '#92400E', bg: '#FFFBEB', border: '#FDE68A' },
    doing: { label: 'doing', color: '#1E40AF', bg: '#EFF6FF', border: '#BFDBFE' },
    done:  { label: 'done',  color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
  }

  function NodeCard({ node }: { node: any }) {
    const cfg = stageConfig[node.stage] || stageConfig.idea
    const isEditingNext = editingField?.id === node.id && editingField?.field === 'next_action'
    const isEditingReason = editingField?.id === node.id && editingField?.field === 'delay_reason'

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
          position: 'relative',
        }}
        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
        onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}
      >
        {/* Stage badge */}
        <div style={{ marginBottom: '8px' }}>
          <span style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: cfg.color,
            background: 'white',
            border: `1px solid ${cfg.border}`,
            borderRadius: '20px',
            padding: '2px 8px',
          }}>{cfg.label}</span>
        </div>

        {/* Content */}
        <p style={{ fontWeight: 600, fontSize: '14px', color: '#111827', lineHeight: 1.5, marginBottom: '8px' }}>
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
              background: 'white', marginBottom: '6px', outline: 'none', color: '#B91C1C',
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
            style={{ fontSize: '11px', color: '#DC2626', marginBottom: '6px', cursor: 'pointer' }}
            onClick={() => {
              setEditingField({ id: node.id, field: 'delay_reason' })
              setEditValue(node.delay_reason || '')
            }}
          >
            ⚠ {node.delay_reason}
          </p>
        ) : (
          <p
            style={{ fontSize: '11px', color: '#FCA5A5', marginBottom: '6px', cursor: 'pointer', minHeight: '16px' }}
            onClick={() => {
              setEditingField({ id: node.id, field: 'delay_reason' })
              setEditValue('')
            }}
          >
            <span style={{ color: '#FEE2E2' }}>+ 지연 이유</span>
          </p>
        )}

        {/* Dates */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', color: '#9CA3AF' }}>생성 {formatDate(node.created_at)}</span>
          {node.updated_at && node.updated_at !== node.created_at && (
            <span style={{ fontSize: '10px', color: '#9CA3AF' }}>수정 {formatDate(node.updated_at)}</span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {node.stage !== 'focus' && node.stage !== 'done' && (
            <button
              onClick={() => updateStage(node, 'focus')}
              style={{
                fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
                border: '1px solid #FDE68A', background: '#FFFBEB', color: '#92400E',
                cursor: 'pointer', fontWeight: 500,
              }}
            >focus</button>
          )}
          {node.stage !== 'doing' && node.stage !== 'done' && (
            <button
              onClick={() => updateStage(node, 'doing')}
              style={{
                fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
                border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1E40AF',
                cursor: 'pointer', fontWeight: 500,
              }}
            >doing</button>
          )}
          {node.stage !== 'done' && (
            <button
              onClick={() => updateStage(node, 'done')}
              style={{
                fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
                border: '1px solid #BBF7D0', background: '#F0FDF4', color: '#166534',
                cursor: 'pointer', fontWeight: 500,
              }}
            >done</button>
          )}
          {node.stage === 'done' && (
            <button
              onClick={() => updateStage(node, 'idea')}
              style={{
                fontSize: '11px', padding: '4px 10px', borderRadius: '6px',
                border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280',
                cursor: 'pointer', fontWeight: 500,
              }}
            >↩ reopen</button>
          )}
        </div>
      </div>
    )
  }

  const stages = ['idea', 'focus', 'doing'] as const

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', marginBottom: '2px' }}>Flow OS</h1>
          <p style={{ fontSize: '12px', color: '#9CA3AF' }}>{today}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {stages.map(s => {
            const count = nodes.filter(n => n.stage === s).length
            const cfg = stageConfig[s]
            return (
              <span key={s} style={{
                fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                borderRadius: '20px', background: cfg.bg, color: cfg.color,
                border: `1px solid ${cfg.border}`
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
          }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNode()}
          placeholder="생각 입력 → Enter (idea로 저장)"
          onFocus={e => (e.target.style.borderColor = '#93C5FD')}
          onBlur={e => (e.target.style.borderColor = '#E5E7EB')}
        />
        <button
          onClick={addNode}
          style={{
            padding: '10px 18px', fontSize: '13px', fontWeight: 600,
            background: '#1E40AF', color: 'white', border: 'none',
            borderRadius: '10px', cursor: 'pointer',
          }}
        >+ 추가</button>
      </div>

      {/* Insight */}
      {insight && (
        <div style={{
          background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '10px',
          padding: '10px 14px', marginBottom: '20px', fontSize: '13px', color: '#1E40AF',
        }}>
          💡 {insight}
        </div>
      )}

      {/* Board */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '36px' }}>
        {stages.map(stage => {
          const cfg = stageConfig[stage]
          const stageNodes = nodes.filter(n => n.stage === stage)
          return (
            <div key={stage}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px'
              }}>
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

      {/* Snapshots */}
      <div>
        <h2 style={{ fontSize: '13px', fontWeight: 700, color: '#6B7280', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '12px' }}>
          snapshots
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {snapshots.map(s => (
            <div key={s.id} style={{
              background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '10px',
              padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            }}>
              <div>
                <p style={{ fontSize: '12px', color: '#374151', fontWeight: 500, marginBottom: '2px' }}>{s.state}</p>
                <p style={{ fontSize: '11px', color: '#9CA3AF' }}>{s.progress} · {s.criteria}</p>
                <p style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>Q: {s.question}</p>
              </div>
              <button
                onClick={() => createNodeFromSnapshot(s)}
                style={{
                  fontSize: '11px', padding: '4px 10px', borderRadius: '6px', whiteSpace: 'nowrap',
                  border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1E40AF',
                  cursor: 'pointer', fontWeight: 500, marginLeft: '12px', flexShrink: 0,
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
