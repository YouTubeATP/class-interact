// A tiny OpenAI-compatible chat server for tests: no network, no key, no cost, and a script the tests can rely on.
// It speaks the streaming `/v1/chat/completions` protocol that AIMLAPI (and the AI SDK's openai-compatible provider) use.
//
//   what the last message says                 what the "model" does
//   ------------------------------------------ -----------------------------------------------------------
//   a user message containing "BROKEN"          answers HTTP 500 (the upstream is down)
//   a user message containing "SLOW"            starts replying, then stalls (to test cancelling a request)
//   a user message containing "invalid"         calls add_slides with a quiz whose answer key is wrong
//   any other user message                      calls add_slides with a title slide and a quiz
//   a tool result that says "ok":false          calls add_slides again with the quiz corrected
//   any other tool result                       says it is done
import { createServer } from 'node:http';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const goodSlides = (topic) => [
  { type: 'content', config: { title: `${topic} quiz`, body: 'Let us see what you know.' } },
  { type: 'quiz', config: { question: `Which planet is closest to the Sun?`, options: [{ id: 'a', text: 'Mercury' }, { id: 'b', text: 'Venus' }, { id: 'c', text: 'Mars' }], correctOptionId: 'a', explanation: 'Mercury orbits closest to the Sun.', timeLimitSec: 20 } },
];
const badSlides = () => [{ type: 'quiz', config: { question: 'Broken quiz', options: [{ id: 'a', text: 'One' }, { id: 'b', text: 'Two' }], correctOptionId: 'zzz' } }];

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join(' ');
  return '';
}

export async function startFakeLlm({ port = 0 } = {}) {
  const requests = [];
  const sockets = new Set();
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404).end('not found');
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body;
    try { body = JSON.parse(raw); } catch { res.writeHead(400).end('bad json'); return; }
    requests.push({ headers: req.headers, body });

    const messages = body.messages ?? [];
    const last = messages[messages.length - 1] ?? {};
    const userText = textOf(last.content);
    if (last.role === 'user' && userText.includes('BROKEN')) {
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: 'upstream exploded: secret-internal-detail' } }));
      return;
    }

    const id = `chatcmpl-${requests.length}`;
    const send = (delta, finish = null) => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    send({ role: 'assistant', content: '' });

    if (last.role === 'user' && userText.includes('SLOW')) {
      send({ content: 'Thinking' });
      await sleep(30_000);
      return;
    }

    let calls = null;
    let say = '';
    if (last.role === 'user') {
      calls = userText.includes('invalid') ? badSlides() : goodSlides('Planets');
      say = userText.includes('invalid') ? 'Adding it now. ' : 'Sure. ';
    } else if (last.role === 'tool') {
      if (textOf(last.content).includes('"ok":false')) { calls = goodSlides('Planets (fixed)').slice(1); say = 'That was not valid, let me fix it. '; }
      else say = 'All done: I added **two slides**.\n\n- a title slide\n- a quiz about planets\n\nHave a look at the quiz.';
    }
    if (say) for (const word of say.match(/\S+\s*/g) ?? []) { send({ content: word }); await sleep(5); }
    if (calls) {
      const args = JSON.stringify({ slides: calls });
      send({ tool_calls: [{ index: 0, id: `call_${requests.length}`, type: 'function', function: { name: 'add_slides', arguments: '' } }] });
      for (let i = 0; i < args.length; i += 40) { send({ tool_calls: [{ index: 0, function: { arguments: args.slice(i, i + 40) } }] }); await sleep(2); }
      send({}, 'tool_calls');
    } else send({}, 'stop');
    res.write('data: [DONE]\n\n');
    res.end();
  });
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const { port: actual } = server.address();
  return {
    url: `http://127.0.0.1:${actual}/v1`,
    requests,
    close: () => new Promise((r) => { for (const s of sockets) s.destroy(); server.close(() => r()); }),
  };
}

// run directly:  node scripts/fake-llm.mjs [port]
if (import.meta.url === `file://${process.argv[1]}`) {
  const fake = await startFakeLlm({ port: Number(process.argv[2] ?? 4010) });
  console.log(`Fake LLM listening at ${fake.url}`);
}
