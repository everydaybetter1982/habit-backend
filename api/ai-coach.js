// Triggering Vercel deploy

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { contents, systemInstruction } = req.body;

  // 1. Try Google Gemini First
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction,
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 150 },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (geminiRes.ok && !geminiData.error) {
      const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) return res.status(200).json({ reply, provider: 'gemini' });
    }
  } catch (e) {}

  // 2. Fallback to Groq if Gemini hits a 503 or fails
  try {
    const groqMessages = [
      { role: 'system', content: systemInstruction?.parts?.[0]?.text || 'You are Kin.' },
      ...contents.map(c => ({
        role: c.role === 'model' ? 'assistant' : 'user',
        content: c.parts[0].text
      }))
    ];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: 150,
        temperature: 0.7
      })
    });

    const groqData = await groqRes.json();
    if (groqRes.ok && groqData.choices?.[0]?.message?.content) {
      return res.status(200).json({ reply: groqData.choices[0].message.content, provider: 'groq-fallback' });
    }
  } catch (e) {}

  // 3. Ultimate Safety Net
  return res.status(200).json({
    reply: "I hear you. Let's take a slow, deep breath and focus on just one tiny, zero-pressure step together.",
    provider: 'local-fallback'
  });
}
