'use client'

import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

export default function Home() {
  const [nodes, setNodes] = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [insight, setInsight] = useState('')

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
      { content: input, stage: 'idea', snapshot_created: false }
    ])

    setInput('')
    fetchNodes()
  }

  async function updateStage(id: string, stage: string) {
    await supabase
      .from('nodes')
      .update({
        stage,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    fetchNodes()
  }

  async function createNodeFromSnapshot(s: any) {
    await supabase.from('nodes').insert([
      {
        content: `[From Snapshot]\n${s.question}`,
        stage: 'focus',
        snapshot_created: false
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

    const stuckCount = data.filter(s =>
      s.progress?.includes('진행 없음')
    ).length

    if (stuckCount >= 3) {
      setInsight('최근 반복적으로 진행이 멈추고 있음 → 실행 지속성 문제 가능성')
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Flow OS</h1>

      <input
        className="border p-2 w-full mb-4"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addNode()}
        placeholder="생각 입력"
      />

      {insight && (
        <div className="bg-blue-100 p-2 mb-4">
          💡 {insight}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {['idea', 'focus', 'doing'].map(stage => (
          <div key={stage}>
            <h2>{stage}</h2>

            {nodes
              .filter(n => n.stage === stage)
              .map(n => (
                <div key={n.id} className="border p-2 mb-2">
                  <p>{n.content}</p>

                  {stage !== 'focus' && (
                    <button onClick={() => updateStage(n.id, 'focus')}>
                      Focus
                    </button>
                  )}
                  {stage !== 'doing' && (
                    <button onClick={() => updateStage(n.id, 'doing')}>
                      Doing
                    </button>
                  )}
                  <button onClick={() => updateStage(n.id, 'done')}>
                    Done
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h2>Snapshots</h2>

        {snapshots.map(s => (
          <div key={s.id} className="border p-2 mb-2">
            <p>{s.question}</p>

            <button
              onClick={() => createNodeFromSnapshot(s)}
              className="mt-2 bg-blue-200 px-2 py-1"
            >
              다시 실행
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}