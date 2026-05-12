import dagre from 'dagre'
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Form, Link, redirect, useFetcher, useLoaderData } from 'react-router'
import { useEffect, useMemo, useState } from 'react'
import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import type { Json } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

type FormQuestionMapItem = {
  question_code: string
  position: number
  prompt: string
  type: string
  options_override: Json | null
  visibility_condition: Json | null
  prompt_override: string | null
}

type LoaderData = {
  form: {
    id: string
    name: string
  }
  returnTo: string
  questions: FormQuestionMapItem[]
}

const safeReturnTo = (input: string | null) => {
  if (!input) return '/manage/form'
  if (!input.startsWith('/')) return '/manage/form'
  if (input.startsWith('//')) return '/manage/form'
  if (input.includes('://')) return '/manage/form'
  return input
}

const getConditionDependencies = (condition: Json | null | undefined): string[] => {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) return []
  const normalized = condition as {
    all?: Json[]
    any?: Json[]
    question_code?: string
  }

  const collected = new Set<string>()
  if (typeof normalized.question_code === 'string' && normalized.question_code) {
    collected.add(normalized.question_code)
  }
  for (const nested of normalized.all ?? []) {
    for (const dep of getConditionDependencies(nested)) {
      collected.add(dep)
    }
  }
  for (const nested of normalized.any ?? []) {
    for (const dep of getConditionDependencies(nested)) {
      collected.add(dep)
    }
  }
  return [...collected]
}

const makeLayout = (nodes: Node[], edges: Edge[]) => {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 30 })

  nodes.forEach(node => {
    graph.setNode(node.id, { width: 260, height: 88 })
  })
  edges.forEach(edge => {
    graph.setEdge(edge.source, edge.target)
  })
  dagre.layout(graph)

  return nodes.map(node => {
    const position = graph.node(node.id)
    return {
      ...node,
      position: {
        x: position.x - 130,
        y: position.y - 44,
      },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }
  })
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/home', { headers: auth.headers })
  }

  const formId = params.formID
  if (!formId) {
    throw redirect('/manage/form', { headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)
  const url = new URL(request.url)
  const { data: formRow, error: formError } = await supabase
    .from('form')
    .select('id, name')
    .eq('id', formId)
    .maybeSingle()

  if (formError || !formRow) {
    throw redirect('/manage/form', { headers })
  }

  const { data: rows, error: mapError } = await supabase
    .from('form_question_map')
    .select('question_code, position, prompt_override, options_override, visibility_condition, form_question ( prompt, type )')
    .eq('form_id', formId)
    .order('position', { ascending: true })

  if (mapError) {
    throw new Response(mapError.message, { status: 500, headers })
  }

  const questions: FormQuestionMapItem[] = (rows ?? []).map(row => {
    const base = Array.isArray(row.form_question) ? row.form_question[0] : row.form_question
    return {
      question_code: String(row.question_code ?? ''),
      position: Number(row.position ?? 0),
      prompt: String(row.prompt_override ?? base?.prompt ?? ''),
      type: String(base?.type ?? 'text'),
      options_override: (row.options_override ?? null) as Json | null,
      visibility_condition: (row.visibility_condition ?? null) as Json | null,
      prompt_override: row.prompt_override ?? null,
    }
  })

  return {
    form: { id: formRow.id, name: formRow.name },
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
    questions,
  } satisfies LoaderData
}

export async function action({ request, params }: ActionFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return { error: 'Unauthorized' }
  }

  const formId = params.formID
  if (!formId) {
    return { error: 'Missing form ID' }
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  if (intent !== 'update-question') {
    return { error: 'Unsupported action' }
  }

  const questionCode = String(formData.get('question_code') ?? '').trim()
  const promptOverride = String(formData.get('prompt_override') ?? '').trim()
  const positionRaw = String(formData.get('position') ?? '').trim()
  const optionsOverrideRaw = String(formData.get('options_override') ?? '').trim()
  const visibilityConditionRaw = String(formData.get('visibility_condition') ?? '').trim()

  if (!questionCode) {
    return { error: 'Question code is required.' }
  }

  const position = Number(positionRaw)
  if (!Number.isInteger(position) || position <= 0) {
    return { error: 'Position must be a positive whole number.' }
  }

  let optionsOverride: Json | null = null
  if (optionsOverrideRaw) {
    try {
      optionsOverride = JSON.parse(optionsOverrideRaw) as Json
    } catch {
      return { error: 'Options override must be valid JSON.' }
    }
  }

  let visibilityCondition: Json | null = null
  if (visibilityConditionRaw) {
    try {
      visibilityCondition = JSON.parse(visibilityConditionRaw) as Json
    } catch {
      return { error: 'Visibility condition must be valid JSON.' }
    }
  }

  const { supabase } = createClient(request)
  const { error } = await supabase
    .from('form_question_map')
    .update({
      position,
      prompt_override: promptOverride || null,
      options_override: optionsOverride,
      visibility_condition: visibilityCondition,
    })
    .eq('form_id', formId)
    .eq('question_code', questionCode)

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}

const prettyJson = (value: Json | null) => {
  if (value == null) return ''
  return JSON.stringify(value, null, 2)
}

type NodeData = {
  label: string
}

export default function ManageFormFlowEditorPage() {
  const { form, questions, returnTo } = useLoaderData() as LoaderData
  const fetcher = useFetcher<{ success?: boolean; error?: string }>()
  const [selectedQuestionCode, setSelectedQuestionCode] = useState<string>(questions[0]?.question_code ?? '')

  useEffect(() => {
    if (!questions.find(q => q.question_code === selectedQuestionCode)) {
      setSelectedQuestionCode(questions[0]?.question_code ?? '')
    }
  }, [questions, selectedQuestionCode])

  const selectedQuestion = questions.find(q => q.question_code === selectedQuestionCode) ?? null

  const { nodes, edges } = useMemo(() => {
    const baseNodes: Node<NodeData>[] = questions.map(question => ({
      id: question.question_code,
      type: 'default',
      data: {
        label: `${question.position}. ${question.question_code}\n${question.prompt}`,
      },
      position: { x: 0, y: 0 },
      className: selectedQuestionCode === question.question_code ? 'ring-2 ring-primary' : undefined,
      style: {
        width: 260,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: 'var(--card-foreground)',
        padding: 10,
        whiteSpace: 'pre-wrap',
        fontSize: 12,
        lineHeight: 1.4,
      },
    }))

    const linearEdges: Edge[] = questions.slice(0, -1).map((question, index) => ({
      id: `linear-${question.question_code}-${questions[index + 1].question_code}`,
      source: question.question_code,
      target: questions[index + 1].question_code,
      animated: false,
      style: { stroke: 'var(--muted-foreground)' },
      markerEnd: { type: MarkerType.ArrowClosed },
    }))

    const conditionalEdges: Edge[] = questions.flatMap(question => {
      const deps = getConditionDependencies(question.visibility_condition)
      return deps
        .filter(dep => dep !== question.question_code)
        .map(dep => ({
          id: `cond-${dep}-${question.question_code}`,
          source: dep,
          target: question.question_code,
          label: 'condition',
          animated: true,
          style: { stroke: 'var(--brand-pink)' },
          labelStyle: { fill: 'var(--foreground)', fontSize: 11 },
          markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--brand-pink)' },
        }))
    })

    const uniqueEdgesMap = new Map<string, Edge>()
    for (const edge of [...linearEdges, ...conditionalEdges]) {
      uniqueEdgesMap.set(edge.id, edge)
    }

    const dedupedEdges = [...uniqueEdgesMap.values()]
    const laidOutNodes = makeLayout(baseNodes, dedupedEdges)
    return { nodes: laidOutNodes, edges: dedupedEdges }
  }, [questions, selectedQuestionCode])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{form.name}</h1>
          <p className="text-sm text-muted-foreground">Visual editor for question flow and visibility logic.</p>
        </div>
        <Link to={returnTo} className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
          Back to forms
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="h-[72vh] min-h-[540px] overflow-hidden rounded-lg border bg-card">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            fitView
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            onNodeClick={(_, node) => setSelectedQuestionCode(node.id)}
          >
            <Background gap={16} size={1} />
            <MiniMap pannable zoomable />
            <Controls />
          </ReactFlow>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">Question Inspector</h2>
          {!selectedQuestion ? (
            <p className="mt-2 text-sm text-muted-foreground">Select a question node to edit its settings.</p>
          ) : (
            <fetcher.Form method="post" className="mt-3 space-y-3">
              <input type="hidden" name="intent" value="update-question" />
              <input type="hidden" name="question_code" value={selectedQuestion.question_code} />

              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Question code</label>
                <input
                  disabled
                  value={selectedQuestion.question_code}
                  className="h-9 rounded border border-input bg-muted px-2 text-sm"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <input
                  disabled
                  value={selectedQuestion.type}
                  className="h-9 rounded border border-input bg-muted px-2 text-sm"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Position</label>
                <input
                  name="position"
                  type="number"
                  min={1}
                  defaultValue={selectedQuestion.position}
                  className="h-9 w-28 rounded border border-input bg-background px-2 text-sm"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Prompt override</label>
                <textarea
                  name="prompt_override"
                  defaultValue={selectedQuestion.prompt_override ?? ''}
                  className="min-h-20 rounded border border-input bg-background px-2 py-1.5 text-sm"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Options override JSON</label>
                <textarea
                  name="options_override"
                  defaultValue={prettyJson(selectedQuestion.options_override)}
                  className="min-h-28 rounded border border-input bg-background px-2 py-1.5 font-mono text-xs"
                />
              </div>

              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Visibility condition JSON</label>
                <textarea
                  name="visibility_condition"
                  defaultValue={prettyJson(selectedQuestion.visibility_condition)}
                  className="min-h-28 rounded border border-input bg-background px-2 py-1.5 font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Uses existing condition schema: <code>all</code>, <code>any</code>, <code>question_code</code>,{' '}
                  <code>equals</code>, <code>not_equals</code>, <code>includes</code>, <code>truthy</code>.
                </p>
              </div>

              {fetcher.data?.error ? <p className="text-sm text-destructive">{fetcher.data.error}</p> : null}
              {fetcher.data?.success ? <p className="text-sm text-emerald-700">Saved.</p> : null}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={fetcher.state !== 'idle'}
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                >
                  {fetcher.state === 'submitting' ? 'Saving...' : 'Save question settings'}
                </button>
              </div>
            </fetcher.Form>
          )}

          <div className="mt-4 rounded-md border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">How to read the flow</p>
            <p>Gray arrows show default question order by position.</p>
            <p>Pink arrows show conditional dependencies from visibility logic.</p>
          </div>
        </div>
      </div>

      <Form method="get" action="/manage/form" className="rounded-md border border-border bg-muted/20 p-3">
        <p className="text-sm text-muted-foreground">
          Tip: open this editor directly with <code>/manage/form/&lt;form-id&gt;</code>.
        </p>
      </Form>
    </div>
  )
}
