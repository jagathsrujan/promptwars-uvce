insert into public.runs (input_text, output_json, model, prompt_version)
values (
  'seed: hello world',
  '{"answer": "seed row", "confidence": "low"}',
  'stub',
  'v0-seed'
);
