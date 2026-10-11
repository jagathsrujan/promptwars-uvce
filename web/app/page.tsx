"use client";
import { useState } from "react";

export default function Home() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult("");
    try {
      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setResult("Request failed. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 16px" }}>
      <h1>PromptWars x UVCE — Starter</h1>
      <p>Replace this UI with the core user journey once the problem statement drops.</p>
      <form onSubmit={onSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          style={{ width: "100%", padding: 12 }}
          placeholder="Enter input…"
        />
        <button type="submit" disabled={loading} style={{ marginTop: 12, padding: "10px 20px" }}>
          {loading ? "Working…" : "Solve"}
        </button>
      </form>
      {result && (
        <pre style={{ marginTop: 16, padding: 12, background: "#f4f4f4", overflowX: "auto" }}>
          {result}
        </pre>
      )}
    </main>
  );
}
