export async function GET() {
  return Response.json({
    ok: true,
    service: "promptwars-web",
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
    ),
  });
}
