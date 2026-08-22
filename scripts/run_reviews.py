from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
PACKETS = {
    "runtime": ROOT / "docs/review-packet-runtime.md",
    "provider-ui": ROOT / "docs/review-packet-provider-ui.md",
    "project": ROOT / "docs/review-packet-project.md",
}
OUT = ROOT / "docs/review-results"
OUT.mkdir(parents=True, exist_ok=True)

SYSTEM = """You are a rigorous senior code reviewer helping improve a mobile-first Obsidian community plugin. Review only the supplied repository packet. Be concrete, skeptical, and constructive. Focus on correctness, mobile compatibility, security/privacy, provider protocol fidelity, prompt/context leakage, UX, maintainability, and testability. Do not reproduce the whole packet. Return markdown with these sections: Summary, Blocking issues (P0/P1), Important improvements (P2), Nice-to-have ideas (P3), and Suggested next patch. For every issue include file/line or a precise symbol, why it matters, and a practical fix. If a concern is speculative, label it as such. Do not request or invent credentials or vault contents."""

REVIEWERS = [
    ("gemini-direct", "gemini", "gemini-3.6-flash"),
    ("agnes-direct", "agnes", "agnes-2.0-flash"),
    ("gpt-5", "builtin", "gpt-5"),
    ("claude-sonnet-4-6", "builtin", "claude-sonnet-4-6"),
]


def user_prompt(packet_name: str, packet: str) -> str:
    return f"""Review packet: {packet_name}\n\n{packet}\n\nIndependently criticize this implementation and propose the smallest high-value next patch. Remember that the plugin must run on mobile and must avoid placing whole vault files into a single model request."""


def ask_direct(provider: str, model: str, prompt: str) -> str:
    if provider == "gemini":
        key = os.environ.get("GEMINI_API_KEY", "")
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not available")
        response = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": key, "Content-Type": "application/json"},
            json={
                "systemInstruction": {"parts": [{"text": SYSTEM}]},
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1},
            },
            timeout=120,
        )
        data: dict[str, Any] = response.json()
        if response.status_code >= 400:
            raise RuntimeError(f"Gemini HTTP {response.status_code}: {data.get('error', {}).get('message', 'unknown error')}")
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        return "\n".join(part.get("text", "") for part in parts).strip()
    if provider == "agnes":
        key = os.environ.get("AGNES_API_KEY", "")
        if not key:
            raise RuntimeError("AGNES_API_KEY is not available")
        response = requests.post(
            "https://apihub.agnes-ai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
                "temperature": 0.1,
            },
            timeout=120,
        )
        data = response.json()
        if response.status_code >= 400:
            raise RuntimeError(f"Agnes HTTP {response.status_code}: {data.get('error', {}).get('message', 'unknown error')}")
        return (data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()
    raise ValueError(provider)


def ask_builtin(model: str, prompt: str) -> str:
    client = OpenAI()
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
    }
    if model.startswith("gpt-"):
        kwargs["max_completion_tokens"] = 3500
    else:
        kwargs["max_tokens"] = 3500
    response = client.chat.completions.create(**kwargs)
    return (response.choices[0].message.content or "").strip()


manifest: list[dict[str, Any]] = []
for packet_name, packet_path in PACKETS.items():
    packet = packet_path.read_text(encoding="utf-8")
    for reviewer_name, provider, model in REVIEWERS:
        output_path = OUT / f"{packet_name}__{reviewer_name}.md"
        record: dict[str, Any] = {
            "packet": packet_name,
            "reviewer": reviewer_name,
            "provider": provider,
            "model": model,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        print(f"Reviewing {packet_name} with {reviewer_name}", flush=True)
        try:
            prompt = user_prompt(packet_name, packet)
            review = ask_direct(provider, model, prompt) if provider in {"gemini", "agnes"} else ask_builtin(model, prompt)
            output_path.write_text(
                f"# {packet_name} — {reviewer_name}\n\n"
                f"_Model: `{model}`. Packet contains repository code/docs only; no credentials or vault files._\n\n"
                f"{review}\n",
                encoding="utf-8",
            )
            record["status"] = "ok"
            record["output"] = str(output_path.relative_to(ROOT))
        except Exception as exc:  # noqa: BLE001 - preserve per-reviewer results
            output_path.write_text(f"# {packet_name} — {reviewer_name}\n\nReview failed: {exc}\n", encoding="utf-8")
            record["status"] = "error"
            record["error"] = str(exc)
        manifest.append(record)
        (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

print(json.dumps({"reviews": len(manifest), "successful": sum(item.get("status") == "ok" for item in manifest)}))
