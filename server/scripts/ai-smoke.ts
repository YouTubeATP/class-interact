/**
 * Manual smoke test for the AI assistant: plays the browser's part against a running server and prints what happens.
 * Uses the real model, so it needs the server started with AIMLAPI_KEY. Not part of CI.
 *
 *   npm run ai:smoke -w server -- "Make a 4 slide deck about the water cycle" [http://localhost:3001]
 */
import { applyAiTool, createEmptyDoc, describeDeck, type PresentationDoc } from '@classinteract/shared';

const prompt = process.argv[2] ?? 'Make a short deck about the water cycle with a title slide, a quiz and a matching question.';
const base = process.argv[3] ?? 'http://localhost:3001';

let doc: PresentationDoc = createEmptyDoc('Smoke test');
const messages: any[] = [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: prompt }] }];

for (let round = 1; round <= 12; round++) {
  const res = await fetch(`${base}/api/studio/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const parts: any[] = [];
  let text = '';
  for (const line of (await res.text()).split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    const e = JSON.parse(line.slice(6));
    if (e.type === 'text-delta') text += e.delta;
    if (e.type === 'error') console.log('  stream error:', e.errorText);
    if (e.type === 'tool-input-available') {
      const out = applyAiTool(doc, e.toolName, e.input);
      doc = out.doc;
      console.log(`  tool ${e.toolName}(${JSON.stringify(e.input).slice(0, 110)}…) -> ${out.result.ok ? 'ok' : 'REJECTED ' + JSON.stringify((out.result as any).issues ?? (out.result as any).error)}`);
      parts.push({ type: `tool-${e.toolName}`, toolCallId: e.toolCallId, state: 'output-available', input: e.input, output: out.result });
    }
  }
  if (text) console.log(`assistant: ${text.trim()}`);
  messages.push({ id: `a${round}`, role: 'assistant', parts: [...(text ? [{ type: 'text', text }] : []), ...parts] });
  if (parts.length === 0) break;
}

console.log('\nFinal deck:', JSON.stringify(describeDeck(doc), null, 1));
