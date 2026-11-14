(async () => {
  try {
    const init = await fetch("https://stablehorde.net/api/v2/generate/text/async", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: "0000000000" },
      body: JSON.stringify({ prompt: "Responde en español, breve: ¿Cuál es el horario de un estudio de tatuajes?", params: { max_length: 220 }, models: ["llama2_rebel"], n: 1 }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await init.json();
    console.log("async:", init.status, JSON.stringify(j).slice(0, 200));
    const id = j.id;
    if (!id) return;
    const ini = Date.now();
    while (Date.now() - ini < 90000) {
      await new Promise(r => setTimeout(r, 8000));
      const chk = await fetch("https://stablehorde.net/api/v2/generate/text/check/" + id);
      const { finished } = await chk.json().catch(() => ({}));
      if (!finished) continue;
      const st = await fetch("https://stablehorde.net/api/v2/generate/text/status/" + id);
      const data = await st.json();
      const gen = data.generations && data.generations[0];
      if (gen) { console.log("TEXTO:", (gen.text || "").slice(0, 300).replace(/\s+/g, " ")); return; }
      console.log("sin generaciones:", JSON.stringify(data).slice(0, 200));
      return;
    }
    console.log("timeout cola");
  } catch (e) { console.log("FALLO:", e.message); }
})();
